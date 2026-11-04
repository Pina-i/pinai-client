# @pinai/crypto

The E2EE core: MLS orchestration, identity, the history key, the code handshake, attestation
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
  fingerprint (SHA-512 of MSK public, sliced).
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
  `knownGroupIds[]`), `recovery_passphrase` (`current`: the account's 24
  words, the one generation they give, the root key the device approved
  itself over with them, and their salt and HAK, so a check runs no Argon2id;
  `pending`: words minted whose `PUT` is unanswered, with their key and HAK;
  `standing`: where the words stood when last checked; `admission`: whether the
  device was in at its last check, read when the IdP can't be reached;
  `newest_generation`: the newest generation seen. Read strictly — 24 words, a 16-byte salt, a
  32-byte HAK; a row that won't open or parse is moved to
  `<key>:unreadable:<ISO time>:<random>`, never deleted; a device key that can't be
  loaded throws),
  `device_attestation` (the root key, its attestation and the device's HPKE
  key — `hpke` null in a row from before it, which registers again — and,
  beside it, `device_trust`'s rows `trust:seen`, `trust:approved` (device ids
  with root keys), `trust:revoked` (device ids) and `trust:partners` (device ids
  with the root and HPKE keys a code handshake gave): a store of their own would
  take an IndexedDB upgrade. Read as the passphrase's are, an unreadable row set
  aside and named (`unreadable`); `addToDeviceTrust` reads each row again just
  before writing it, so another tab's additions stay). All at-rest blobs are
  encrypted under the same per-device key; the key is also re-used
  by the Zustand `persist` middleware so the message-plaintext cache
  lives behind the same key material.
- **`@pinai/api/e2ee/key-directory.adapter`** — `KeyDirectoryApiAdapter`
  implementing `IKeyDirectoryPort`, outside this package. REST client for
  the `/api/keys/*` and `/api/mls/*` endpoints; the identity methods are no-op
  stubs, since `/api/keys/identity` is gone.
- **`history-archive.adapter.ts`** — `HistoryArchiveAdapter`
  (`identity-provider/specs/e2ee.md § 3.7`): the HAK, Argon2id over the words
  trimmed, lowercased and joined by single spaces, as UTF-8, whoever calls it
  (m=64 MiB, t=3, p=4); `derive(hak)` the check value
  and approval public key; `signApproval`; AES-256-GCM entries with the
  `PINAI-ARCHIVE-v1` ids as associated data.
- **`spake2-p256.ts`** — SPAKE2 as RFC 9382 specifies it, suite
  SPAKE2-P256-SHA256-HKDF-HMAC: the RFC's M and N, SEC1 uncompressed shares
  checked on the curve, TT, Ke/Ka, KcA/KcB with an AAD, the HMAC confirmations.
  Pure; Appendix B's vectors pin it (`apps/web/test/spake2-p256.spec.ts`).
- **`approval-handshake.ts`** — the code handshake (`identity-provider/specs/e2ee.md
  § 3.10`): `newApprovalCode` (uniform, rejection-sampled), the code through
  Argon2id (19 MiB, t=2, p=1, 40 bytes) salted with the request id, identities
  `<actor_uri>\n<device_id>`, the request bound in the confirmation keys' AAD;
  five messages, each `0x01 || type || payload` (the layout in its header); the
  keys sealed AES-256-GCM under a key a direction from Ke, sent only once the
  peer's confirmation verified. `ApprovalHandshake` is the port's
  `ApprovalHandshakeSession`: a message out of turn or format, a seal that
  doesn't open → `HandshakeRefused("tampered")`, a confirmation →
  `"wrong-code"`; either ends the side. `close()` drops its secrets — done by
  itself once the peer's keys came —; Argon2's output, the code's bytes and each
  sealing key are zeroed after use. A man in the middle running one session
  against each side gets at most two online guesses per code.
- **`canonical-bytes.ts`** — the bytes the protocol signs
  (`identity-provider/specs/e2ee.md § 7.2`): `IDP-ATTEST-v1`,
  `PINAI-DEVICE-HPKE-v1`, `PINAI-LEAF-BINDING-v1`, `PINAI-DEVICE-APPROVAL-v1`,
  rebuilt from bytes, and an archive entry's `PINAI-ARCHIVE-v1` associated
  data (its ids lowercased, as the IdP writes UUIDs);
  `apps/web/test/canonical-bytes.spec.ts` holds the IdP's golden vectors.
- **`attestation-chain.adapter.ts`** — what a device checks itself, Ed25519
  strict (`verifyStrict`, a small-order key refused) as the IdP checks root keys.
  `verifyLeafCredential(leaf, jwks)` — § 3.4's checks 1–5 on a leaf or a
  claimed KeyPackage: v2, the issuer exactly the actor's origin (where its JWKS
  is fetched), expiry (5 min skew, as for the device chain),
  the attestation under the issuer's JWKS key (fetched again once on failure,
  for rotation), the leaf binding under the attested root key over the
  LeafNode's own signature key. `verifyDeviceRoot` — one listed device,
  unrevoked, JWKS → attestation → root key: what announcing and approving rest
  on. `verifyDeviceChain` adds its HPKE key, for sharing the passphrase. An
  issuer out of reach is `unreachable`, never a bad signature.
  `checkListedDevices(actorUri, devices, approvalKey, jwks, rootChecks?)` — each
  listed device's root chain (cached by the row's content until its expiry,
  `unreachable` never kept) and each approval's signature over its listed root
  key (`verifyApproval`): by the passphrase under the approval key this device
  derived, never the listed one; by a device under that device's listed root
  key, carried as `approverRootKey`. Who is approved is the domain's
  `approvedDevices`.
- **`e2ee.adapter.ts`** — `E2eeAdapter`. The `IE2eePort` impl. Wires
  every sub-adapter into `register`, `replenishKeyPackages`,
  `encryptOutbound`, `decryptInbound`, `addContactToGroup`,
  `ensureGroupExists`, `consumePendingWelcomes`, `revokeDevice`, `addOwnDevices`, `pruneGroup`,
  `forgetGroup`, the history key's, `loadStoredPassphrase`,
  `hasLocalIdentity`,
  `getOwnFingerprint`, `getPeerFingerprint`. Bootstrap paths
  (`ensureInitialized`, `register`) are guarded by cached promises
  so concurrent callers (React strict-mode double-fire, sibling
  hooks racing) can't produce two `Provider` / `Identity`
  instances; `replenishKeyPackages` likewise shares one run, so the
  entry check, the 6 h timer and a `key_packages_low` push never
  overshoot the stash cap. The whole port is intentionally idempotent.
  - **KeyPackages** go out through `register` and `replenishKeyPackages` only, the
    domain calling them for a device that is in (`registerIdentityUseCase`,
    `replenishKeyPackagesUseCase`). Both follow the refill's rule (§ 3.5): a stash at
    the threshold, or one the status doesn't list, filled to the cap — never topped up
    on a reload above it. Both bind the account (`bindToAccount`): the engine's
    credential and the storage's bound actor URI.
  - **Registration** (`registerDevice`): the root key and the HPKE key (from
    `IHpkePort`, made once) together, the HPKE key signed by the root key; again
    within 30 days of expiry, and at once for a device holding no HPKE key. The
    answer's `signed_message` must be the `IDP-ATTEST-v1` bytes rebuilt from it,
    since every peer rebuilds them from the credential's text. `register` runs
    it first: every KeyPackage carries the attestation. A new attestation goes to
    `onDeviceRegistered` listeners — the fanout refetches the device list, so the
    leaves take it in the same page load.
  - **The bound credential** (v2, `leafCredential`): the root key signs the leaf
    key into `leaf_binding` before `setIdentity`. Nothing is bound without an
    attestation, and a registration landing during a bind binds again; a refill
    whose binding a renewal dropped binds again before it makes KeyPackages.
  - **Leaves checked**: a claimed KeyPackage before it is added
    (`addContactToGroup` — the contact's devices whose leaves verify, none
    verifying is `KeyPackageUnavailable` —, `addOwnDevices`), each as the very
    device it was claimed for (`admitsClaim`); every leaf met — a Welcome's tree
    on a join or rejoin, a commit's `leavesMet` in `decryptInbound` and the
    catch-up. One met that fails is logged and recorded by conversation and leaf
    index — until that leaf verifies, changes or leaves — and goes to
    `onTrustEvent` listeners, late ones getting the records held; it is
    committed out by `removeUntrustedLeaves` when forged, and stays when its
    attestation only expired. An issuer out of reach records nothing: the leaf
    is checked when next met. Verdicts are kept by leaf fingerprint until the
    attestation's expiry, `unreachable` never.
  - **Trust** (`reviewDevices`, `identity-provider/specs/e2ee.md § 3.9`): a list
    naming an id twice refused whole (`device-list-refused`); the list's
    revocations kept for good — unless the kept ones can't be read, and then
    nothing is decided; then, unless a pending key waits, the key read again:
    only `holds` acts (`judgeDevices`), the devices found approved and those
    seen kept; every review that decides nothing — a list naming an id twice,
    revocations that can't be read, a device not acting — withdraws the unapproved
    devices it announced, and so does a check of the key that finds the device no
    longer holding (`setHolding`): only an acting device announces. Any device warns of a reset by
    a device it never found approved, or attributed to itself while it sets
    none, and of a key changed under the generation it holds. Events stand until
    what they are about changes (`onTrustWithdrawn`), are replayed to late
    listeners, read whole with `trustSnapshot`, logged; an unapproved device
    stands again after a reload.
  - **A verdict acts** only while the device holds its generation
    (`actingNow`): one from before a new generation adds nobody and commits no
    own leaf out.
  - **`removeUntrustedLeaves`** — in the group's queue, through `commitEach`:
    every non-own leaf of the tree as it stands judged again before each commit
    (`judgeLeaf`; an index changes hands): a forgery, any device; an own leaf
    the acting verdict doesn't approve over its root key (recorded
    `not-listed` / `not-approved`), once `reviewAgain` read the list again. A
    commit refused other than by an epoch race throws, the records kept for the
    next sync; one refused for good (a `4xx` but `401`, `408`, `409`, `429`)
    isn't built again this page load.
  - **Removal**: `pruneGroup` also commits out leaves whose credential names
    nobody or that a check shows forged (`leafOrigin`), whomever they name;
    `revokeDevice` keeps the revocation, then every leaf naming the device, one
    a commit.
  - `addOwnDevices` takes the verdict: a sibling no verified leaf stands for is
    added, its KeyPackage carrying the root key it was approved over; one no
    KeyPackage could be claimed for is answered in `unclaimed`, for the fanout to
    try again.
  - `commitEach` — the one loop for a run of commits (`pruneGroup`,
    `addOwnDevices`, `refreshOwnLeaf`, `removeUntrustedLeaves`): one a commit,
    looked at again after each, an epoch race caught up and tried again, five at most.
  - **`refreshOwnLeaf`** — a commit putting the credential the device makes now
    into its own leaf when the leaf carries another: one from before the leaf
    binding, or before a renewal — a registration under way is waited for. Run by
    `syncOwnGroupsUseCase` after the catch-up.
  - **The code handshake** (§ 3.10): `startApprovalHandshake` with this device's
    root and HPKE keys; `checkHandshakePeer` — the peer's keys from the exchange
    against its one listed row, no revocation seen, its root chain
    (`verifyDeviceRoot`), a refusal standing as `handshake-keys-refused` with its
    latest reason and withdrawn once the device passes; a list naming an id
    twice (`device-list-refused`), an issuer out of reach or an expiry
    `unsettled`; `signDeviceApproval`, `approvesThisDevice`; partners kept, and
    the rows read, in the trust rows' turn. `checkHandshakePartners` — for the
    domain's `deviceAdmission`: the list's revocations kept for good first (not
    from a list naming an id twice), then each partner's `by: device` approvals
    listed for this device, verified over its current root key under the
    partner's root key from the exchange. `recordAdmission` / `recordedAdmission`
    — the admission row.
  - **The history key** (`identity-provider/specs/e2ee.md § 3.6–3.9`): the flows
    are the domain's; here the crypto and the standing (`standingAgainst`).
    `mintHistoryKey` seals the words as pending before answering them, the same
    words for the page load until dropped; `promotePendingHistoryKey` keeps
    them once the IdP took their key. `keepPassphrase` refuses words that don't
    give the key, a generation below the newest seen, and words another tab kept
    meanwhile (the row is read again just before the write). `checkHistoryKey`
    runs no Argon2id: it stands the kept HAK's values against the key in force;
    the words stay, whatever it says. Argon2id runs once per words and salt, in
    flight included, keyed by a digest. The standing and the key held change
    together, and a flush clears them only when still the ones it used.
  - **Uploads** — entries wait unsealed while the standing is unchecked or
    holds (`ARCHIVE_BUFFER_LIMIT`, the oldest dropped), and are dropped out of
    it; they go out under the generation held, each sealed with its ids as
    associated data; an edit under the id its ciphertext gives. The first check
    is a flow's, after the naming. `stale_history_key` reads the key again and
    sends the batch again once; a second stale in one flush waits for the next.
    `restoreHistory` opens each entry under the ids its row carries: one moved
    is skipped.

## Use cases

`@pinai/domain/usecases/e2ee/`:
- `register-identity.usecase.ts` — KeyPackages only once in (`check-admission.usecase.ts`,
  `models/admission.ts`)
- `replenish-keypackages.usecase.ts`
- `gate-this-device.usecase.ts` — where the onboarding gate sends the device
- The history key's: `set-up-this-device`, `bootstrap-first-device`,
  `restore-history-from-passphrase`, `approve-by-passphrase`,
  `check-history-key` — see `packages/domain/CLAUDE.md`.
- `approval-handshake.usecase.ts` — the code handshake's flows; see
  `packages/domain/CLAUDE.md`.
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
  conversationIds)` iterates the caller-supplied conversation
  list, builds + posts a Remove commit per group. Per-group failures are logged + swallowed
  so one bad group doesn't block the rest; the commit a failure leaves
  pending is cleared, or the group's next commit would be refused.

### `addOwnDevices`

- Brings the user's other devices into a group this device holds, one
  device a commit (`devicesToAdd`), each with a KeyPackage claimed by its
  device id. It never founds a group, and never reuses
  `addContactToGroup`, which does both: that is how a second device used
  to end up in groups holding only itself. A `409` clears the pending
  commit, catches up and looks again, as `pruneGroup` does.
- Every change to a group's MLS state goes through `inGroup`, one queue
  per conversation: `addContactToGroup` / `ensureGroupExists` (the check
  and the founding in one run), `addOwnDevices`, `catchUp`, the catch-up
  inside `decryptInbound`, joins in `consumePendingWelcomes`,
  `pruneGroup`, `revokeDevice`, `forgetGroup`. Each awaits the network
  between steps; without the queue, the DS's push of this device's own
  commit had `catchUp` apply it over the one still pending. Encrypting
  and plain decrypts stay outside: openmls encrypts with a commit pending,
  and the past-epoch window covers the merge that follows.
- A founding whose first add fails drops the group it created
  (`forgetFoundedGroup`): another device most likely founded it first, and
  a group holding only this device would take its sends unread. The claim
  happens before the group is created, so a refused claim leaves nothing.
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
- A group keeps its last five epochs' keys for unread messages
  (`MAX_PAST_EPOCHS`, at create and at join), so a message a commit
  overtook still decrypts. openmls sizes that store when the group is
  created or joined and persists it: a group held before the window
  existed keeps none.

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
- The use case (`revoke-device.usecase.ts`) is the integration seam:
  the IdP first (`IDeviceDirectoryPort.markRevoked` — it may refuse,
  asking for the password again, before anything was done), then these
  Remove commits. The Devices UI pulls the conversation list from the
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

- `apps/web/test/e2ee.spec.ts` — identity adapter + MLS two-member round trip.
- `apps/web/test/spake2-p256.spec.ts` — RFC 9382's M, N and Appendix B;
  `approval-handshake.spec.ts` — the handshake's rules and two real engines over a
  relay keeping the IdP's rules (`test/setup/approval-relay.ts`).
- `apps/web/test/e2ee-integration.spec.ts` — Alice+Bob full-loop register →
  add → text → reaction → edit → attachment, plus a same-IdP
  routing case.
- `apps/web/test/canonical-bytes.spec.ts`, `hpke.spec.ts` (RFC 9180 A.1.1 through
  the real bundle), `attestation-chain.spec.ts` (both chains), `register-device.spec.ts`
  (the root key and HPKE key registration, the tick's renewal); the integration suite's
  last blocks check leaves end to end — forged KeyPackages refused, untrusted leaves
  announced and forgotten, own leaves refreshed, a renewal racing a refresh or a refill,
  and an acting device's adds and commits out. Its directory attests as the IdP would
  (`test/setup/issuers.ts`, which also writes list rows and approvals).
- `apps/web/test/device-trust.spec.ts` — the approval rules, real signatures checked
  (the IdP's canonical bytes among them), and the review: who acts, the events, the
  trust rows.
- `apps/web/test/message-status.spec.ts` — fade-window math behind the
  `MessageStatus` molecule.
- `apps/web/test/history-key.spec.ts` — the history key's flows with the real
  engine against an IdP answering as the spec says (`test/setup/history-idp.ts`):
  the first device's order, racing founders, typed words, the startup check,
  uploads on `stale_history_key`, the archive's associated data;
  `history-key-api.spec.ts`, its routes; `history-key-vectors.spec.ts`,
  known answers computed with OpenSSL and Python's `cryptography`.
- `apps/web/test/gate-routing.spec.ts` — the gate's table (`decideGateRoute`, `resetCause`),
  `isUnreachable`, and the gate on real engines: setup, the new-device and reset pages, the
  offline rule on what was recorded.
- `apps/web/test/admission.spec.ts` — when a device is in: the rule, then real keys (a
  partner's approval over the current root key and the exchanged key, an old partner, a
  list-swapped key, a rollback and a swapped approval key no partner overrides, revocations
  kept); KeyPackages on each path only once in, through the real `register` and refills
  (`publishingDevice`): the refill's rule, a failed renewal, a device turned out.
- `apps/web/test/onboarding-pages.spec.ts` — the gate hook's re-checks (throttle, trust
  events, the newest deciding, a failure, an unmount or a sign-out mid-check), the tick
  gated on it, the new-device and reset pages rendered.
- `apps/web/test/devices-warnings.spec.ts` — Settings → Devices' "not approved", "Not mine"
  and the refused-list banner, from the engine's own reviews.
- `apps/web/test/device-fanout-retry.spec.ts` — the fanout's backoff for unclaimed siblings;
  `e2ee-integration.spec.ts` has a sibling's stash landing late, mid-run included.
- `apps/web/test/recovery-passphrase-input.spec.ts` — 6a `isPassphraseComplete`
  predicate.

Counts deliberately omitted — `pnpm run test` is the source of truth, and a
number written here is wrong by the next commit.

## Phase 6a additions (recovery passphrase onboarding)

- **`hasLocalIdentity()`** on `IE2eePort`. Cheap predicate the
  onboarding gate uses to short-circuit when an identity bundle is
  already in IDB.
- **`loadStoredPassphrase()`** on `IE2eePort`. Reveal source for the
  6b Settings UI.
- **`recovery_passphrase` IDB store** (DB v3) in
  `IndexedDbStorageAdapter`. Encrypted under the device key — same
  pattern as `identity` and `mls_snapshot`. Migration is additive.
- **`bootstrapFirstDeviceUseCase`** in `@pinai/domain/usecases/e2ee/`
  — the first device's flow, since rebuilt around the history key's
  generations (see "The history key" above).
- **`@scure/bip39` dependency** (~10 KB gzipped). English 2048-word
  list + `generateMnemonic` / `validateMnemonic`. Same noble family
  used by `identity.adapter.ts`.
- **`useIdentityOnboardingGate`** in `presentation/hooks/`. Replaces
  the old `useRegisterMlsIdentity` auto-register-on-mount; routes to
  `/onboarding/recovery-setup` (first device),
  `/onboarding/recovery-restore` (a new device on an account with a
  history key), or admits to the app shell. The pure `decideGateRoute`
  helper is unit-tested in `test/gate-routing.spec.ts`.
- **`RecoveryPassphraseDisplay`** / **`RecoveryPassphraseInput`**
  molecules. Display variant is read-only; Input variant has
  per-word BIP-39 validation + paste-all support. Both designed to
  be reused by the 6b reveal UI.
- **`RecoverySetupPage`** / **`RecoveryRestorePage`** in
  `presentation/pages/onboarding/`. Setup runs the bootstrap use
  case, shows the 24 generated words on success. Restore drives the
  typed words' flow (`restoreHistoryFromPassphraseUseCase`); "Start
  fresh on this device" lets the device in without them.

## Phase 6b additions (Settings → Devices)

- **`getDeviceId()`** on `IE2eePort`. Returns this device's stable
  UUID — the Devices view uses it to mark the current row with a
  "This device" chip, because the server can't tell which caller
  it's answering.
- **`IDeviceDirectoryPort`** (`@pinai/domain/ports/device-directory.port`)
  and **`DeviceDirectoryApiAdapter`** — separate from `IE2eePort` so
  the directory REST surface (`/api/keys/devices`,
  `/api/keys/devices/:id/revoke`) stays free of MLS crypto. Revoking
  is `revokeDeviceUseCase`: `IDeviceDirectoryPort.markRevoked` signs the
  device out, then `IE2eePort.revokeDevice` emits the Remove commits.
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
- **Pure helpers**:
  - `formatLastSeen` (`@pinai/domain/models/relative-time`) — "just now" /
    "N minutes ago" / "yesterday" / "N days ago" / etc.
  - `device-fingerprint.ts` (`presentation/_libs/`) — `sha256(uuid)` → RFC 4648 base32 →
    8 chars formatted "XXXX-XXXX". Display-only.
- **Test additions**: `test/relative-time.spec.ts`,
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
  `encrypt(key, plaintext, aad)` → AES-256-GCM with fresh 12-byte nonce;
  `decrypt(key, ct, nonce, aad)` throws on auth-tag mismatch.
- **`@pinai/api/e2ee/history-archive-api.adapter`** —
  `HistoryArchiveApiAdapter` implementing `IHistoryArchivePort`.
  Pure transport for `POST/GET/DELETE /api/history/messages` +
  `GET/PUT /api/history/key`; base64 encode/decode of opaque
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
  - `bufferForArchive` / `startFlushing` /
    `stopFlushing` — Layer B engine. Takes an
    `ArchiveEnvelope` (`@pinai/domain/models/history-archive`), once per
    id per page load: a sent message is queued by the send's answer and by
    its echo. One drain at a time, `ARCHIVE_UPLOAD_LIMIT` (50) entries per
    upload; a batch the IdP refuses (a `4xx` other than `401`/`408`/`429`)
    is dropped, any other failure re-queued for the next tick.
  - `restoreHistory` — pull-and-decrypt loop; answers the decoded
    entries, which the domain turns into messages.

### Use cases (`@pinai/domain/usecases/e2ee/`)

- `register-device.usecase.ts` — port delegate.
- `restore-history-from-passphrase.usecase.ts` — the archive's entries as
  messages (`restoredMessages`), for `RecoveryRestorePage`.

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

## Leaf binding and the device's HPKE key

- The credential is v2 (`leaf_binding`), which undoes Phase 7's "wire-format
  simplification" above: the wrapper now makes the leaf key before the
  credential, so the root key signs it. v1 is read as no credential at all.
- `IHpkePort` is the bundle's HPKE, beside `IMlsEngine` rather than on it; the
  key shares that use it come later.
