# adapters/e2ee — Phase 4b complete

Hexagonal seam between the rest of the app and the MLS crypto core.
Exactly one external entry point (`IE2eePort`) — `e2ee.adapter.ts` is
the only thing wired into IoC; the six sub-adapters below are
collaborators it composes.

## Files

- **`mls.adapter.ts`** — TS façade over the `openmls-wasm` bundle.
  Owns one `Provider` + one `Identity` + a `Map<conversation_id, Group>`.
  Exposes `initialize`, `setIdentity`, `createKeyPackage`,
  `createGroup`/`joinGroup`, `addMember`/`removeMember`/`update`,
  `mergePendingCommit`, `encryptApplication`, `processMessage`,
  `exportSecret`. All bytes-in / bytes-out.
- **`identity.adapter.ts`** — `NobleIdentityAdapter`.
  MSK/SSK/USK Ed25519 generation via `@noble/curves`; SSK + USK signed
  by MSK with domain-separation tags. Computes the 60-char base32
  fingerprint (SHA-512 of MSK public, sliced). `recoverFromMsk`
  rebuilds an `IdentityKeypair` from a recovered MSK private (used by
  the Recovery Key flow on a fresh device).
- **`storage.adapter.ts`** — `IndexedDbStorageAdapter`. Stores:
  `meta` (device UUID + non-extractable AES-GCM CryptoKey),
  `identity` (encrypted MSK/SSK/USK bundle), `mls_snapshot`
  (encrypted snapshot of the openmls provider state +
  `knownGroupIds[]`, DB v2). All at-rest blobs are encrypted under
  the same per-device key; the key is also re-used by the Zustand
  `persist` middleware so the message-plaintext cache lives behind
  the same key material.
- **`key-directory.adapter.ts`** — `KeyDirectoryApiAdapter`. REST
  client for the eight `/api/keys/*` (incl. recovery PUT/GET/DELETE)
  and three `/api/mls/*` endpoints.
- **`recovery.adapter.ts`** — `NobleRecoveryAdapter`. Argon2id
  (`@noble/hashes/argon2.js`) + XChaCha20-Poly1305 (`@noble/ciphers`)
  wrap/unwrap of the MSK private. Default params m=64 MiB, t=3, p=4
  per `specs/05-e2ee.md § 9`. AAD-tagged, nonce-prepended.
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
  `ensureGroupExists`, `consumePendingWelcomes`, `revokeDevice`,
  `setupRecoveryKey`, `recoverFromPassphrase`,
  `startPairingAsInitiator`, `pairAsResponder`,
  `getOwnFingerprint`, `getPeerFingerprint`. Bootstrap paths
  (`ensureInitialized`, `register`) are guarded by cached promises
  so concurrent callers (React strict-mode double-fire, sibling
  hooks racing) can't produce two `Provider` / `Identity`
  instances. The whole port is intentionally idempotent.

## Use cases

`web-client/src/domain/usecases/e2ee/`:
- `register-identity.usecase.ts`
- `replenish-keypackages.usecase.ts`
- `setup-recovery-key.usecase.ts`
- `recover-from-passphrase.usecase.ts`
- `pair-device.usecase.ts` — `startPairingAsInitiatorUseCase` and
  `pairAsResponderUseCase` plus a `PairDeviceTransport` interface
  for caller-supplied message ferrying.
- `revoke-device.usecase.ts` — calls into the deferred port method.

## UI plumbing

- **`useFingerprint(actorUri)`** in `presentation/hooks/` — reads from
  zustand cache, fires a one-shot fetch on miss, stores via
  `setFingerprint`. Local user uses on-device identity; peers go
  through `getPeerFingerprint` (which validates the SSK+USK chain).
- **`store/slices/e2ee.slice.ts`** — `fingerprintsByActorUri` map.
  Cleared on `clearSession` alongside auth state.
- **`/settings/e2ee-debug`** route — DEV-only inspection panel
  (production builds redirect to `/home`). Shows own fingerprint,
  cached peer fingerprints, KeyPackage stash counts.

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
  Mounted in `_authenticated` layout via `useConsumeMlsWelcomes` hook.
- First-message UUID pinning: client generates `crypto.randomUUID()`
  on first send, uses it as the MLS `group_id` AND passes it on
  `POST /api/dm` so the server stores under the same UUID (via
  `get_or_create_dm_with_id`).

## Phase 5b cleanup additions

- **Zustand persist** for the message-plaintext cache. `store/encrypted-idb-storage.ts`
  builds a `PersistStorage<T>` backed by a separate `pinai-zustand-store`
  IndexedDB database, encrypting each slice value with the same
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

- **`attachment-crypto.ts`** — `encryptForUpload(file)` mints a fresh
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
  so one bad group doesn't block the rest.
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
  the session left off.

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
- **Full-loop integration test** (`test/e2ee-integration.spec.ts`).
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
- **`addressToActorUri`** in `domain/models/identity.ts` — inverse
  of `actorUriToAddress`. Used by `ConversationPage.viewmodel` to
  derive the recipient's actor URI from the route param (`name`)
  when `localDmConvos` hasn't refreshed yet (first message to a
  new contact). Same scheme heuristic the IdP uses for federation.
- **Persistence format**: the Zustand `persist` middleware's storage
  (`store/encrypted-idb-storage.ts`) uses **msgpack** (`msgpackr`)
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

- `test/e2ee.spec.ts` — identity adapter + MLS two-member round trip +
  recovery wrap/unwrap. 12 tests.
- `test/spake2.spec.ts` — SPAKE2 round trip + wrong-password
  detection + role-mismatch + tamper detection. 7 tests.
- `test/pairing.spec.ts` — full pairing dance round trip + tampered
  pair_token + tampered ciphertext + malformed QR. 4 tests.
- `test/e2ee-integration.spec.ts` — Alice+Bob full-loop register →
  add → text → reaction → edit → attachment, plus a same-IdP
  routing case. 2 tests.

- `test/message-status.spec.ts` — fade-window math behind the
  `MessageStatus` molecule. 5 tests.

30 tests across 5 suites, all green; type-check clean across every
E2EE file.
