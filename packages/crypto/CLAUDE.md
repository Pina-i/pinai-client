# @pinai/crypto

The E2EE core: MLS orchestration, identity, recovery, pairing, attestation
verification, attachment sealing, and the encrypted store's schema.

Exactly one external entry point — `IE2eePort`, implemented by
`e2ee.adapter.ts`, which is the only thing wired into IoC. Everything else
here is a collaborator it composes.

Portable by construction. Every primitive is `@noble`/`@scure`, never
`crypto.subtle`, because what this package produces is protocol-visible —
other devices have to accept the same bytes. `eslint.config.js` blocks the
browser-only globals for `packages/*`, so the portability is checked rather
than intended.

Depends on `@pinai/domain` and the noble libraries. Not on `@pinai/api`: the
key directory's contract is `IKeyDirectoryPort` in the domain.

## What stayed in `apps/web`

Three collaborators could not come, and the shape of each is the mobile work:

- The MLS engine — now `@pinai/mls`, which keeps one implementation per
  platform. The wasm one cannot be shared; `leaf-credential.ts` beside it
  must be.
- **`device-key.adapter.ts`** — a non-extractable `CryptoKey`, which has no
  equivalent value on a device. `IDeviceKeyPort` is the seam; the Keychain is
  the other implementation.
- **`storage/`** — IndexedDB. `SealedStorage` here holds the schema and the
  sealing; only the byte store underneath is web-specific.

## Files

- **`identity.adapter.ts`** — `NobleIdentityAdapter`.
  MSK/SSK/USK Ed25519 generation via `@noble/curves`; SSK + USK signed
  by MSK with domain-separation tags. Computes the 60-char base32
  fingerprint (SHA-512 of MSK public, sliced). `recoverFromMsk`
  rebuilds an `IdentityKeypair` from a recovered MSK private (used by
  the Recovery Key flow on a fresh device).
- **`sealed-storage.ts`** — `SealedStorage`. Schema + sealing only, with no
  idea where the bytes land: it takes an `IKeyValueStore` and an
  `IDeviceKeyPort`, so a React Native build reuses it whole over SQLite or
  MMKV plus a Keychain key. The backend only ever sees ciphertext; the device
  id and bound actor URI are stored in the clear because reading them must
  not require the key. `clear()` wipes the rows *and* the key, which is what
  makes a device wipe irreversible. `getOrCreateDeviceId` shares the lookup
  while it is in flight: callers racing on a fresh device would otherwise each
  mint an id, and leaves would carry one the device no longer has. Stores:
  `meta` (device UUID + non-extractable AES-GCM CryptoKey),
  `identity` (encrypted MSK/SSK/USK bundle), `mls_snapshot`
  (encrypted snapshot of the openmls provider state +
  `knownGroupIds[]`), `recovery_passphrase` (encrypted local copy
  of the 24-word mnemonic, Phase 6a — DB v3). All at-rest blobs are
  encrypted under the same per-device key; the key is also re-used
  by the Zustand `persist` middleware so the message-plaintext cache
  lives behind the same key material.
- **`@pinai/api/e2ee/key-directory.adapter`** — `KeyDirectoryApiAdapter`
  implementing `IKeyDirectoryPort`, outside this package. REST client for
  the `/api/keys/*` and `/api/mls/*` endpoints; the identity and
  recovery-blob methods are no-op stubs, since `/api/keys/recovery` is gone.
- **`recovery.adapter.ts`** — `NobleRecoveryAdapter`. Argon2id
  (`@noble/hashes/argon2.js`) + XChaCha20-Poly1305 (`@noble/ciphers`)
  wrap/unwrap of the MSK private. Default params m=64 MiB, t=3, p=4
  per `identity-provider/specs/e2ee.md § 9`. AAD-tagged, nonce-prepended.
- **`spake2.ts`** — Hand-rolled SPAKE2 over Ristretto255 via
  `@noble/curves`. M and N derived once via `ristretto255_hasher.hashToCurve`
  from labels. Returns `{ ourMessage, derive(peerMessage) }` →
  `{ sessionKey, ourConfirmation, verifyConfirmation }`.
- **`pairing.adapter.ts`** — `PairingInitiator` / `PairingResponder`
  classes. Wraps SPAKE2 + AEAD-sealed `IdentityKeypair` bundle.
  Existing device emits a `QrPayload`; new device calls `fromQr` +
  ferries SPAKE2 messages through caller-provided transport.
- **`e2ee.adapter.ts`** — `E2eeAdapter`. The `IE2eePort` impl. Wires
  every sub-adapter into `register`, `replenishKeyPackages`,
  `encryptOutbound`, `decryptInbound`, `addContactToGroup`,
  `ensureGroupExists`, `consumePendingWelcomes`, `revokeDevice`, `addOwnDevices`, `pruneGroup`,
  `forgetGroup`,
  `setupRecoveryKey`, `recoverFromPassphrase`, `hasRecoveryKey`,
  `clearRecoveryKey`, `loadStoredPassphrase`, `saveStoredPassphrase`,
  `hasLocalIdentity`, `startPairingAsInitiator`, `pairAsResponder`,
  `getOwnFingerprint`, `getPeerFingerprint`. Bootstrap paths
  (`ensureInitialized`, `register`) are guarded by cached promises
  so concurrent callers (React strict-mode double-fire, sibling
  hooks racing) can't produce two `Provider` / `Identity`
  instances; `replenishKeyPackages` likewise shares one run, so the
  entry check, the 6 h timer and a `key_packages_low` push never
  overshoot the stash cap. The whole port is intentionally idempotent.

## Use cases

`@pinai/domain/usecases/e2ee/`:
- `register-identity.usecase.ts`
- `replenish-keypackages.usecase.ts`
- `setup-recovery-key.usecase.ts`
- `recover-from-passphrase.usecase.ts`
- `bootstrap-first-device.usecase.ts` — Phase 6a. Orchestrates
  `register` → BIP-39 mnemonic generation → `setupRecoveryKey` →
  `saveStoredPassphrase` as one transactional unit (every step is
  idempotent, so retry-on-failure is safe).
- `pair-device.usecase.ts` — `startPairingAsInitiatorUseCase` and
  `pairAsResponderUseCase` plus a `PairDeviceTransport` interface
  for caller-supplied message ferrying.
- `revoke-device.usecase.ts` — calls into the deferred port method.

## UI plumbing

- **`useFingerprint(actorUri)`** in `presentation/hooks/` — reads from
  zustand cache, fires a one-shot fetch on miss, stores via
  `setFingerprint`. Local user uses on-device identity; peers go
  through `getPeerFingerprint` (which validates the SSK+USK chain).
- **`apps/web/src/store/slices/e2ee.slice.ts`** — `fingerprintsByActorUri` map.
  Cleared on `clearSession` alongside auth state.
- **`/settings/e2ee-debug`** route — DEV-only inspection panel
  (production builds redirect to `/home`). Shows own fingerprint,
  cached peer fingerprints, KeyPackage stash counts.

---

## Change log by phase

Everything above describes the package as it stands. What follows is a
chronological record of how it got there, kept because the *why* behind
several of these decisions — the reaction dedup, the ratchet ordering rule,
the msgpack switch — is not recoverable from the code. Read it when
something looks arbitrary; skip it otherwise. It is not maintained as a
description of the current state, and where it disagrees with the sections
above, the sections above win.

## Phase 5b additions

- `claim` accepts `null` `deviceId` ("server picks any device with KPs")
  — `claim_one_any_device` repo helper on the IdP side; the client
  passes `null` for cross-IdP and same-IdP first-message flows.
- `postWelcome` posts to `POST /api/mls/welcomes`. The sender's own
  IdP routes: same-IdP → local `mls_welcomes` insert + WS push;
  cross-IdP → signed AP `Create{Note}` (`mlsKind: welcome`) to the
  recipient IdP's inbox. The browser doesn't branch — the IdP picks
  the path off the `recipient_actor_uri`.
- `ensureGroupExists(idpUrl, accessToken, conversationId, recipientActorUri)`
  on `IE2eePort` — idempotent first-message bootstrap. Lazily called
  by `ConversationPage.viewmodel.ts::sendMessage` before
  `encryptOutbound`.
- `consumePendingWelcomes(idpUrl, accessToken, actorUri)` polls
  `GET /api/mls/welcomes?device_id=` and joins each pending group via
  `mls.joinGroup` (welcomes carry the ratchet tree via the extension).
  A Welcome to a group already held goes to `mls.rejoinGroup`: the device was
  committed out and added back, so a later epoch replaces the group; one no
  later (both sides founded it at once) leaves it as it is.
  Mounted in `_authenticated` layout via `useConsumeMlsWelcomes` hook.
- First-message UUID pinning: client generates `crypto.randomUUID()`
  on first send, uses it as the MLS `group_id` AND passes it on
  `POST /api/dm` so the server stores under the same UUID (via
  `get_or_create_dm_with_id`).

## Phase 5b cleanup additions

- **Zustand persist** for the message-plaintext cache. `apps/web/src/adapters/storage/encrypted-idb-storage.adapter.ts`
  builds a `PersistStorage<T>` backed by a separate per-account
  `pinai-zustand-store:<actor URI>` IndexedDB database, encrypting each slice value with the same
  non-extractable AES-256-GCM `CryptoKey` the E2EE storage adapter
  manages (exposed via `E2eeStorage.getOrCreateDeviceKey()`). The
  store partializes to `dmMessages` + `dmUnread` only — auth /
  presence / avatars stay in memory. Survives reloads, so MLS
  forward secrecy doesn't blank conversation history.
- **Catch-up on missing commits** baked into `decryptInbound`. Pass
  `{ idpUrl, accessToken }` as the third arg; on a decrypt failure
  the adapter pulls `GET /api/mls/groups/:id/commits?since=<epoch>`,
  replays each commit through `processMessage`, retries the original
  decrypt once. WS `new_dm` / `message_edited` and the REST history
  load both pass `catchUp` now.
- **WS `mls_welcome_ready`-triggered consumption.** New event variant
  on `WsServerEvent`; `useIdpWebSocket` calls `consumePendingWelcomes`
  on receipt so a freshly-arriving Welcome bundle lands in the local
  MLS adapter within seconds rather than waiting for the next login
  poll.
- **Cross-IdP welcome delivery.** `POST /api/mls/welcomes` now
  detects whether the recipient is local (insert + WS push as before)
  or remote (resolve the inbox via `remote_actors` cache or fresh
  WebFinger, dispatch via `federation::mls::deliver_welcome_to_remote`).

## Phase 5c additions

- **Reactions** ride as `direct_messages` rows whose decrypted body
  is `ApplicationMessage<ReactionBody>{kind:"reaction"}`. The new
  `applyReaction` action on the WS slice dedup's by reaction message
  id (persisted in `appliedReactionIds`), folds the toggle into the
  target message's `reactions[]`. Sender side: optimistic toggle →
  encrypt → REST send → rollback on failure.
- **Edits** use `ApplicationMessage<EditBody>{kind:"edit"}` over the
  existing `PATCH /api/dm/:id/edit` endpoint. The server replaces the
  row's `mls_ciphertext` + stamps `edited_at`; receivers' WS
  `message_edited` handler decrypts the new ciphertext and applies
  `body.new_text` to the target.
- **Replies** inline `reply_meta` on the text body. Server only sees
  `reply_to_id`; the preview text + sender display name travel inside
  the encrypted MLS body. Receiver populates `Message.replyTo` from
  the decrypted body.
- **`new_dm` dispatch on decrypted kind.** WS hook + REST history
  load both decrypt once and route on `kind`: text → push as
  Message; reaction → `applyReaction`; edit/reply_meta → handled
  inline. The discriminated `MappedRow` from `mapApiMessage` keeps
  the two-pass history-load logic explicit (text first, reactions
  after — reactions need their target to exist).

## Phase 5c.4 additions (attachments)

- **`attachment-crypto.ts`** — speaks `LocalFile` in and `Uint8Array` out,
  never `File`/`Blob`: what to do with decrypted bytes is a platform question
  (an object URL on the web, a cache file on a device).
  `encryptForUpload(file)` mints a fresh
  AES-256-GCM key + 12-byte nonce + client-generated UUID per
  upload, encrypts file bytes with `additionalData = utf8(uuid)`,
  returns ciphertext + AttachmentBlobKey. `decryptDownloaded` runs
  the reverse with the embedded key/nonce + UUID-AAD.
- **`upload-encrypted-attachment.usecase.ts`** — wraps
  `IDmPort.uploadAttachment` with the encrypt-first pipeline. Sends
  the ciphertext as a File named `"encrypted"` with type
  `"application/octet-stream"`; pins the server-side row id via the
  new `attachment_id` form field.
- **Backend tweak** in `idp-messaging`: `POST /api/attachments`
  accepts a single `attachment_id` form field paired with the single
  file part (rejects multi-file uploads when the field is present —
  no implicit pairing).
- **`Message.attachmentKeys?: Record<id, AttachmentBlobKey>`** holds
  decryption material per attachment, populated by both sender
  (optimistic) and receiver (after MLS decrypt). The wire-shape
  `Message.attachments[]` carries placeholder filename + MIME;
  components consult `attachmentKeys` for the real values.
- **`useAttachmentBlobUrl(attachmentId, attachmentKey)`** —
  three-step pipeline: resolve token-protected ciphertext URL →
  fetch ciphertext bytes → AES-GCM decrypt → return
  `URL.createObjectURL(decryptedBlob)`. Object URLs revoked on
  unmount + on key change.

## Phase 5 follow-ups

### `revokeDevice` (landed)

- Leaf credentials embed `(actor_uri, device_id)` as JSON inside the
  BasicCredential — `MlsAdapter.setIdentity(actorUri, deviceId)`.
  Receivers decode the same shape to map a leaf back to its owning
  device.
- Wrapper exposes `Group.list_members()` returning every leaf's
  index + raw credential bytes.
- `MlsAdapter.findLeafByDeviceId(conversationId, actorUri, deviceId)`
  walks the credentials and returns the matching leaf index (or
  null).
- `e2ee.adapter.revokeDevice(idpUrl, token, actorUri, deviceId,
  conversationIds, opts?)` iterates the caller-supplied conversation
  list, builds + posts a Remove commit per group, optionally clears
  the wrapped Recovery Key. Per-group failures are logged + swallowed
  so one bad group doesn't block the rest; the commit a failure leaves
  pending is cleared, or the group's next commit would be refused.

### `addOwnDevices`

- Brings the user's other devices into a group this device holds, one
  device a commit (`devicesToAdd`), each with a KeyPackage claimed by its
  device id. It never founds a group, and never reuses
  `addContactToGroup`, which does both: that is how a second device used
  to end up in groups holding only itself. A `409` clears the pending
  commit, catches up and looks again, as `pruneGroup` does; runs take
  turns on a chained promise.
- `apps/web/test/e2ee-integration.spec.ts` drives it against the real
  engine: the new device reads and is read, a device holding no group
  commits nothing, two devices adding a third converge, a lost commit
  is tried again, two runs at once add once.
- `addContactToGroup` claims a KeyPackage of each of the contact's
  devices (`claimEachDevice`) and adds them one a commit, so every device
  of theirs reads the group; only the first one's failure is the
  caller's. A commit POST that fails clears its pending commit, so the
  add can be tried again.
- `catchUp(idpUrl, token, conversationId)` applies the DS's commits past
  the local epoch for a held group; `useIdpWebSocket` calls it on every
  `mls_commit` push, so a device sends at the epoch the others are at.
- `onGroupHeld(listener)` fires after this device founds a group
  (`addContactToGroup` on a first send) or joins one
  (`consumePendingWelcomes`): the moment its siblings can be added.
- Every member's Welcome carries the ratchet tree: the wasm crate's
  `join_config` sets the extension on join, and a group joined before
  takes it when loaded.

### `pruneGroup`

- Commits out, one Remove a leaf, every device of an actor the roster
  doesn't hold (`leavesToRemove`), looking at the leaves again after each
  commit. A `409` clears the pending commit, catches up on the DS's log and
  looks again — at most five times; any other failure clears it and throws.
- `apps/web/test/e2ee-integration.spec.ts` drives it against the real
  engine: the one removed reads nothing after, a lost commit leaves the
  group able to commit, two admins at once converge, and the one removed
  reads again once added back.
- `forgetGroup` drops a group's MLS state from the device, for a group the
  user was removed from and cleared from their list.
- The use case (`revoke-device.usecase.ts`) is the integration seam;
  Phase 6's Devices UI pulls the conversation list from the
  zustand store and invokes it.

### MLS group-state persistence (landed)

- WASM wrapper: `Provider.serialize_storage()` / `Provider.deserialize_storage(bytes)`
  round-trip the openmls `MemoryStorage` HashMap as length-prefixed
  `(key, value)` pairs. `Group.load_from_provider(provider, group_id)`
  rebuilds the in-memory handle from a restored provider. Covered by
  a new Rust test (`provider_storage_round_trip_restores_group`)
  that drops the provider entirely, restores into a fresh one, and
  decrypts a fresh inbound application message.
- `MlsAdapter.serializeStorage()` + `restoreStorage(bytes, knownGroupIds)`
  expose the wrapper API to TS; restore re-loads each known group
  via `Group.load_from_provider` and warm-cleans any group that
  didn't make it into the snapshot.
- `IndexedDbStorageAdapter` adds an `mls_snapshot` store (DB version
  bumped to 2). Snapshots are encrypted at rest under the same
  device key. Decrypt failure drops the row so the next save starts
  clean.
- `E2eeAdapter.ensureInitialized` restores the snapshot once per
  session; every state-changing op (`createKeyPackage`,
  `encryptApplication`, `decryptInbound`, `addContactToGroup`,
  `consumePendingWelcomes`, `revokeDevice`) calls
  `persistMlsState()` afterwards so reload picks up exactly where
  the session left off. New KeyPackages are the exception: they are
  saved before they are uploaded, and not uploaded when the save
  fails, so the server never hands out a package this device can no
  longer open after a reload.

## Phase 5d additions

- **Cross-IdP claim proxy** (backend, `identity-provider/crates/e2ee/src/packages.rs`).
  When `actor_uri` is non-local on `POST /api/keys/packages/claim`, the
  server federates the request to the target IdP via HTTP-Sig instead
  of looking it up locally. The browser still hits its own IdP — the
  IdP signs the proxy hop on behalf of the local user. Peer-auth
  callers can't proxy through us (rejected to prevent chaining).
- **`Uint8Array` JSON replacer/reviver in `e2ee.adapter.ts`**. Plain
  `JSON.stringify` turns `Uint8Array` into an indexed object — Web
  Crypto rejects it on decrypt. Encryption now base64-encodes any
  `Uint8Array` into `"@u8:<base64>"`; decryption reverses it. Matters
  because `TextBody.attachments[].key` / `.nonce` are real
  `Uint8Array`s and need to come out the other side as the same.
- **Full-loop integration test** (`apps/web/test/e2ee-integration.spec.ts`).
  Two `E2eeAdapter`s + an in-memory `IKeyDirectoryAdapter` + per-
  adapter `E2eeStorage` stubs drive register → `addContactToGroup` →
  `consumePendingWelcomes` → text → reaction → edit → encrypted
  attachment upload + receiver decrypt. Two cases: cross-IdP (Alice
  + Bob on different issuers, asserts the welcome is tagged
  `remote`) and same-IdP (asserts the `local` insert path).
- **Cross-IdP welcome dispatch** (client side). `addContactToGroup`
  unconditionally calls `directory.postWelcome` — the comment used
  to claim "same-IdP DMs are the supported path", but the server
  has handled both since Phase 5b cleanup, so the client just hands
  the welcome over and lets the IdP route. The integration test's
  cross-IdP case proves the path is exercised.

## Post-5d hardening

- **Cross-IdP row-id bridging** (server-side, but mirrored on the
  client): `direct_messages.id` and `message_attachments.id` are
  now derived from the trailing UUID of the activity URL. Both
  IdPs in a cross-server DM see the same row ids — required so
  the `target_message_id` inside the encrypted MLS body and the
  `AttachmentBlobKey.id` in the body's `attachments[]` resolve on
  the receiver. Implemented in
  `repos::messages::create_message` and
  `federation::inbox::persist_inbound_attachments`. See
  `identity-provider/CLAUDE.md` "Cross-cutting rules → Conversations".
- **`addressToActorUri`** in `@pinai/domain/models/identity` — inverse
  of `actorUriToAddress`. Used by `ConversationPage.viewmodel` to
  derive the recipient's actor URI from the route param (`name`)
  when `localDmConvos` hasn't refreshed yet (first message to a
  new contact). Same scheme heuristic the IdP uses for federation.
- **Persistence format**: the Zustand `persist` middleware's storage
  (`apps/web/src/adapters/storage/encrypted-idb-storage.adapter.ts`) uses **msgpack** (`msgpackr`)
  not JSON. `Uint8Array` survives round-trip natively — required
  so `AttachmentBlobKey.key` / `.nonce` rehydrate as real
  `Uint8Array` instances rather than indexed-property objects that
  Web Crypto rejects on decrypt.
- **Optimistic send + status indicator**. `ConversationPage.viewmodel::sendMessage`
  pushes the optimistic message *before* any network work and sets
  `Message.status = "sending"` / `statusAt = now`. `reconcileToServer`
  flips to `"sent"`; any caught error in encrypt / POST flips to
  `"failed"`. The `MessageStatus` molecule renders the lifecycle
  inline next to the timestamp — `Clock` → `Check` (3 s fade) →
  `AlertCircle` + retry `RotateCw`. Retry is session-only via a
  `pendingIntentsRef` map on the conversation viewmodel.
- **`pendingFirstMessageConvId`** in `ConversationPage.viewmodel`:
  on a brand-new conversation, the viewmodel's `conversationKey`
  derivation snaps to the freshly-minted UUID as soon as
  `sendMessage` runs, so the optimistic push (keyed by the new
  UUID) is visible to the render path immediately — without it,
  the sender's first message stayed invisible until `localDmConvos`
  refreshed via Bob's reply.
- **Reaction routing**: `MessageItem.viewmodel::handleReaction` now
  receives `recipientAddress` as a prop from `ConversationPage`
  (same source `sendMessage` uses), looking it up via
  `localDmConvos` was racy right after a first send because the
  sender's own WS echo skips the conversation-list invalidation.
  CRITICAL: the `recipientAddress` guard runs *before*
  `encryptOutbound` — each MLS encrypt advances the send-side
  ratchet (forward secrecy wipes the per-gen key), so an encrypt
  without delivery leaves the sender's counter ahead of the
  recipient's recv-side and every subsequent message in that
  conversation falls outside openmls's out-of-order window.

## Tests

All specs live in `apps/web/test/` — the app is still the only place with a
vitest setup, so a package's specs sit there until it needs its own.

- `apps/web/test/e2ee.spec.ts` — identity adapter + MLS two-member round trip +
  recovery wrap/unwrap.
- `apps/web/test/spake2.spec.ts` — SPAKE2 round trip + wrong-password
  detection + role-mismatch + tamper detection.
- `apps/web/test/pairing.spec.ts` — full pairing dance round trip + tampered
  pair_token + tampered ciphertext + malformed QR.
- `apps/web/test/e2ee-integration.spec.ts` — Alice+Bob full-loop register →
  add → text → reaction → edit → attachment, plus a same-IdP
  routing case.

- `apps/web/test/message-status.spec.ts` — fade-window math behind the
  `MessageStatus` molecule.
- `apps/web/test/bootstrap-first-device.spec.ts` — 6a use-case ordering +
  idempotent retry.
- `apps/web/test/gate-routing.spec.ts` — 6a gate's pure decision table.
- `apps/web/test/recovery-passphrase-input.spec.ts` — 6a `isPassphraseComplete`
  predicate.

Counts deliberately omitted — `pnpm run test` is the source of truth, and a
number written here is wrong by the next commit.

## Phase 6a additions (recovery passphrase onboarding)

- **`hasLocalIdentity()`** on `IE2eePort`. Cheap predicate the
  onboarding gate uses to short-circuit when an identity bundle is
  already in IDB.
- **`hasRecoveryKey(idpUrl, token)`** on `IE2eePort`. Probes
  `GET /api/keys/recovery` and surfaces a boolean — used by the gate
  + the restore page to decide the full vs. degraded variant.
- **`clearRecoveryKey(idpUrl, token)`** on `IE2eePort`. Pairs the
  server-side `DELETE /api/keys/recovery` with a local wipe of the
  passphrase IDB slot. Used by the eventual 6b "Clear recovery key"
  action.
- **`loadStoredPassphrase()`** / **`saveStoredPassphrase(words)`** on
  `IE2eePort`. Reveal source for the 6b Settings UI + the persistence
  side of the bootstrap use case.
- **`recovery_passphrase` IDB store** (DB v3) in
  `IndexedDbStorageAdapter`. Encrypted under the device key — same
  pattern as `identity` and `mls_snapshot`. Migration is additive.
- **`bootstrapFirstDeviceUseCase`** in `@pinai/domain/usecases/e2ee/`.
  Four-step orchestration (register → mnemonic → setupRecoveryKey →
  saveStoredPassphrase); idempotent under retry.
- **`@scure/bip39` dependency** (~10 KB gzipped). English 2048-word
  list + `generateMnemonic` / `validateMnemonic`. Same noble family
  used by `identity.adapter.ts` and `recovery.adapter.ts`.
- **`useIdentityOnboardingGate`** in `presentation/hooks/`. Replaces
  the old `useRegisterMlsIdentity` auto-register-on-mount. Probes
  local identity + server identity + server recovery blob, then
  routes to `/onboarding/recovery-setup` (first device),
  `/onboarding/recovery-restore` (paired-elsewhere or recovery-key
  case), or admits to the app shell. The pure `decideGateRoute`
  helper is unit-tested in `test/gate-routing.spec.ts`.
- **`RecoveryPassphraseDisplay`** / **`RecoveryPassphraseInput`**
  molecules. Display variant is read-only; Input variant has
  per-word BIP-39 validation + paste-all support. Both designed to
  be reused by the 6b reveal UI.
- **`RecoverySetupPage`** / **`RecoveryRestorePage`** in
  `presentation/pages/onboarding/`. Setup runs the bootstrap use
  case, shows the 24 generated words on success. Restore drives
  `recoverFromPassphraseUseCase`; "Start fresh on this device" link
  runs plain `register()`.

## Phase 6b additions (Settings → Devices)

- **`getDeviceId()`** on `IE2eePort`. Returns this device's stable
  UUID — the Devices view uses it to mark the current row with a
  "This device" chip, because the server can't tell which caller
  it's answering.
- **`IDeviceDirectoryPort`** (`@pinai/domain/ports/device-directory.port`)
  and **`DeviceDirectoryApiAdapter`** — separate from `IE2eePort` so
  the directory REST surface (`/api/keys/devices`,
  `/api/keys/devices/:id/revoke`) stays free of MLS crypto. Revoke
  is a two-step orchestration in the viewmodel: `IE2eePort.revokeDevice`
  emits the Remove commits, then `IDeviceDirectoryPort.markRevoked`
  flips the server flag.
- **`useDevices`** in `presentation/hooks/`. TanStack Query hook —
  fetches `/api/keys/devices`, augments each row with `is_current`
  client-side. Query key `["devices", idpUrl]` is invalidated by
  the revoke orchestration.
- **`DevicesEditor`** in
  `presentation/pages/home/SettingsModal/DevicesEditor/`. Wired into
  the Settings two-pane layout. Composes the `RecoveryPassphraseCard`
  molecule + a list of `DeviceCard`s. Per-device "Revoke" buttons
  iterate `localDmConvos` for the conversation list passed to
  `revokeDeviceUseCase`. The local "this device" row never shows a
  revoke button — sign-out for the current device lives on the
  Settings tile grid (existing flow).
- **`RecoveryPassphraseCard`** molecule. 6×4 word grid; blurred by
  default (CSS filter, words stay in the DOM so toggle is in-place
  + flicker-free). Show / Hide / Copy / Clear actions. Empty-state
  copy when `loadStoredPassphrase()` returns null (the device was
  paired via QR and never saw the mnemonic).
- **Pure helpers** in `presentation/_libs/`:
  - `format-last-seen.ts` — "just now" / "N minutes ago" /
    "yesterday" / "N days ago" / etc.
  - `device-fingerprint.ts` — `sha256(uuid)` → RFC 4648 base32 →
    8 chars formatted "XXXX-XXXX". Display-only.
- **Test additions**: `test/format-last-seen.spec.ts`,
  `test/device-fingerprint.spec.ts`.

## Phase 7 additions (per-device identity + history backup)

Trust model shift: drop user-level MSK/SSK/USK identity in favour of
a per-device IdP-attested Device Root Key. The IdP signs a long-lived
attestation per device (1-year lifetime, silent renewal at 30
days); peer clients verify the attestation chain via the issuer's
JWKS. The 24-word passphrase repositions from "recover your account"
to "recover your message history" — derives a History Archive Key
via Argon2id; per-decrypt plaintexts are encrypted under that key
and uploaded to a server-side opaque-ciphertext archive.

See `identity-provider/specs/e2ee.md` in the `Pina-i/pinai` monorepo
for the full design.

### New adapters

- **`apps/web/src/adapters/jwks/jwks-cache.adapter.ts`** — `JwksCacheAdapter`.
  Lazy fetch of `<issuer>/.well-known/jwks.json` with 1-hour
  `localStorage` TTL, in-flight dedup per issuer, refresh-on-
  invalidate for IdP key-rotation safety. Returns raw 32-byte
  Ed25519 public keys ready for `@noble/curves` verify.
- **`attestation-chain.adapter.ts`** — pure
  `verifyLeafCredential(bytes, jwksCache)`. Implements the Section 3
  verification order: parse `LeafCredentialV1` JSON, check
  `v === 1`, confirm issuer origin matches actor URI, check
  `expires_at` (5-min clock-skew slack), verify IdP signature
  (rotation-safe via invalidate-and-retry). Returns
  `{ ok, actorUri, deviceId }` or `{ ok: false, reason }`.
- **`history-archive.adapter.ts`** —
  `HistoryArchiveAdapter`. `deriveKey(passphraseWords, salt)` via
  `argon2idAsync` (t=3, m=64 MiB, p=4, dkLen=32);
  `encrypt(key, plaintext)` → AES-256-GCM with fresh 12-byte nonce;
  `decrypt(key, ct, nonce)` throws on auth-tag mismatch.
- **`@pinai/api/e2ee/history-archive-api.adapter`** —
  `HistoryArchiveApiAdapter` implementing `IHistoryArchivePort`.
  Pure transport for `POST/GET/DELETE /api/history/messages` +
  `GET/POST /api/history/salt`; base64 encode/decode of opaque
  ciphertexts.

### Wire-format simplification

`LeafCredentialV1` JSON inside the MLS BasicCredential is
`{ v: 1, actor_uri, device_id, drk_pub, idp_att: { issuer, kid, expires_at, signature } }`.
The original design's `drk_sig(leaf_pub)` field was dropped because
openmls-wasm doesn't expose the leaf signing key for external pre-
signing without wrapper changes; the remaining trust chain (IdP attests
the Device Root Key + actor; openmls's LeafNode self-signature ensures
leaf integrity; bearer-token authn on KP upload ensures the right device
publishes) holds against the documented threat model.

### Adapter additions

- **`@pinai/api/e2ee/key-directory.adapter`** —
  `IKeyDirectoryPort.registerDevice(idpUrl, accessToken, deviceId, drkPublicKey)`
  POSTs to `/api/keys/devices`; returns `{ signature, kid,
  issued_at, expires_at, signed_message }`.
- **`e2ee.adapter.ts`** — additive Phase 7 methods (old MSK
  `register` path still works alongside):
  - `registerDevice` — idempotent device-attestation flow.
    Dedupes concurrent callers via in-flight promise; renews
    silently when within 30 days of expiry.
  - `bufferDecryptedForArchive` / `startFlushing` /
    `stopFlushing` / `clearHistoryBackup` — Layer B engine.
  - `restoreHistoryFromPassphrase` — pull-and-decrypt loop.
  - `bootstrapFirstDevice` now also calls `registerDevice` after
    the legacy MSK register completes.

### Use cases (`@pinai/domain/usecases/e2ee/`)

- `register-device.usecase.ts` — port delegate.
- `restore-history-from-passphrase.usecase.ts` — port delegate
 . UI trigger deferred — the use case is exercised by
  Settings → Restore in a follow-up.

### Hooks (`presentation/hooks/`)

- `useDeviceFanout` — keeps held groups in step. Every device-list
  refresh (the `device_joined` push only triggers one), conversation-list
  change and `onGroupHeld` call runs `syncOwnGroupsUseCase`: catch each
  group up, then offer it the user's other active devices — see
  "`addOwnDevices`" above.
- `useHistoryArchiveFlusher` — lifecycle hook for the 2-second
  flush timer + buffer (both live in the adapter; this hook is
  pure mount/unmount glue).
- `useIdpWebSocket` gains a `device_joined` event case and a
  module-level `registerDeviceFanoutHandler` slot that the auth
  layout uses to plug `useDeviceFanout.onDeviceJoined` into the
  shared WS connection without business logic in the WS hook.

### Onboarding gate

`decideGateRoute` simplified to two branches (app/setup). The
previous restore branch — recover MSK from a passphrase blob — is
gone; per-device identity means a brand-new device on an existing
account just registers its own MSK + Device Root Key in the setup flow.

### Test additions

- `apps/web/test/jwks-cache.spec.ts` — (TTL, dedup, invalidate,
  unknown kid, concurrent fetches)
- `apps/web/test/attestation-chain.spec.ts` — (well-formed accept,
  origin mismatch, expired, unknown kid, rotation-retry, bad IdP
  signature)
- `apps/web/test/history-archive.spec.ts` — (deterministic derive,
  salt variance, encrypt/decrypt round-trip, wrong-key throws,
  fresh nonce per encrypt)
- `apps/web/test/register-device.spec.ts`
- `apps/web/test/restore-history.spec.ts`
- `apps/web/test/gate-routing.spec.ts` rewritten for the new
  2-branch table

### Rip-out (Phase 5)

- `RecoveryRestorePage` + route — gone; gate no longer routes
  there
- `e2ee-debug` DEV-only inspection page + route — gone
- `useFingerprint` hook — gone (no callers remained)
