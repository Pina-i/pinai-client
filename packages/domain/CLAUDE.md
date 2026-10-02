# @pinai/domain

The business core, as its own workspace package: models, ports and use cases.

Consumed as source TypeScript — there is no build step. `exports` maps
`@pinai/domain/<path>` straight onto `src/<path>.ts`, so an import reads the
same as it did when this was a folder, with the package name in front of it.

It depends on nothing. Not as a convention — `package.json` lists no
dependencies, so an import of anything outside simply fails to resolve. The
eslint rules are the second line, and they say what to do instead.

What follows covers the entries whose rationale is not obvious from reading
them — why a port is shaped the way it is, why a type lives here. It is not
an index: most of the models, ports and use cases are exactly what their
names say, and listing all fifty-odd would age badly and help nobody.

`tsconfig.json` explains the one compromise: `DOM` is in `lib` because `URL`,
`URLSearchParams`, `AbortSignal` and `atob` have no smaller lib to come from.
Those four are the entire platform surface this package assumes, and eslint
blocks the browser-only globals that admitting `DOM` would otherwise allow.

## Modules

### models/auth.ts
- `UserProfile` — sub, email, preferred_username
- `OidcConfig` — authorization/token/userinfo endpoints
- `AuthSession` — access token + user profile
- `isTokenValid(token)` — checks the JWT `exp` claim (no signature
  verification — that is the IdP's job). Used by the route guards.

### ports/auth.port.ts
- `IAuthPort` — interface for OIDC operations
  - `discoverConfig(idpUrl)` — fetch `.well-known/openid-configuration`
  - `exchangeCode(params)` — POST to `/token`, returns access token string
  - `fetchUserInfo(endpoint, token)` — GET `/userinfo`, returns UserProfile
- `AuthPlatform` — the platform half of the flow, injected as one argument:
  - `clientId` — this build's OIDC registration (`web-client`)
  - `IPkcePort` — randomness + SHA-256
  - `IAuthSessionStore` — sync scratch space keyed by `AuthSessionKey`,
    surviving the hand-off to the IdP (`sessionStorage` on the web)
  - `IAuthNavigationPort` — callback/post-logout URLs and the hand-off

### ports/mls-engine.port.ts
- `IMlsEngine` — the MLS engine as the rest of the client sees it, plus
  `MlsCiphertext` / `AddMemberOutput` / `ProcessOutcome`
- **Asynchronous throughout by design**, even though the WASM bundle
  behind it is synchronous: Hermes has no WebAssembly, so React Native
  will drive the same Rust crate through a native binding, and whether
  that binding can be synchronous is not yet known. Retrofitting
  `sync → async` later would rework the whole message path.
- Bytes in, bytes out — every implementation must agree byte-for-byte;
  the specs in `test/` are the contract.

### lib/bytes.ts
- Base64 ↔ bytes, `base64url` for JWS/JWK and padded `base64` elsewhere
- In the domain because base64 is the wire format for every binary field the
  protocol carries, so decoding it is part of speaking the protocol rather
  than a detail of any one transport. Three packages need it.
- `atob`/`btoa` are two of the four globals this package assumes

### ports/key-directory.port.ts
- `IKeyDirectoryPort` — the IdP key directory + MLS Delivery Service as the
  E2EE core needs it: claim key packages, post commits and welcomes, store
  the wrapped recovery blob
- Plus the wire DTOs (`CommitView`, `WelcomeView`, `IdentityKeysResponse`,
  `Argon2Params`, `RecoveryBlobResponse`, `RegisterDeviceResponse`), base64
  already decoded to bytes
- Lives here, not beside its REST implementation, so the crypto core does not
  have to depend on the HTTP client that happens to implement it today

### ports/key-value-store.port.ts
- `IKeyValueStore` — durable opaque byte blobs in named collections; the
  smallest thing that can carry the E2EE store
- Bytes, not arbitrary values: that is the intersection of what IndexedDB,
  SQLite and MMKV can all hold. The device key genuinely cannot be bytes,
  which is why it is a separate port rather than another row here.
- Async throughout, like the MLS engine, because async wraps sync and not
  the reverse

### ports/account-storage.port.ts
- `IAccountStoragePort` — which account's device storage is open. Device
  state is kept per account, so a second account signing in on the same
  device keeps both instead of erasing the first
- `switchTo` may not return: on the web the storage is chosen at page load,
  so switching reloads

### usecases/e2ee/open-account-storage.usecase.ts
- Switches to the signed-in account's storage unless it is already open
- Run by the route guard before anything reads device storage — the
  authenticated layout's hooks read it as soon as they mount

### models/file.ts
- `LocalFile` — `{ name, mimeType, bytes }`, what the domain needs to send a
  file somewhere. The browser has `File`, React Native's pickers return
  `{ uri, name, mimeType }`, and neither can be named here.
- `bytes` is eager, not a lazy reader: E2EE reads every attachment in full to
  encrypt it, so a streaming interface would promise something we never do.
- Conversion lives at the edges — `presentation/_libs/local-file.ts` on the
  web.

### ports/device-key.port.ts
- `IDeviceKeyPort` — at-rest `seal` / `open` bound to this device, plus
  `SealedBytes`
- Exposes **operations, never the key**: the web's non-extractable
  `CryptoKey` and a device's Keychain reference cannot both be named in
  shared code, and a port returning a key handle would force one on the
  other
- What it seals never leaves the device, so implementations need not agree
  on a format — unlike the protocol-level crypto, which must

### ports/attachment-crypto.port.ts
- `IAttachmentCryptoPort` — per-attachment AES-256-GCM seal/open. Protocol
  visible: the key, nonce and AAD travel to the peer in the MLS body, so
  every implementation must agree byte-for-byte.

### usecases/auth/startLogin.usecase.ts
- Generates PKCE verifier + challenge (S256) and random state/nonce via `IPkcePort`
- Stores verifier/state/nonce/endpoints in the `IAuthSessionStore` for the round-trip
- Hands control to IdP `/authorize` via `IAuthNavigationPort`

### usecases/auth/handleCallback.usecase.ts
- Reads `code` + `state` from URL params
- Validates `state` against the `IAuthSessionStore` (CSRF protection)
- Calls `IAuthPort.exchangeCode` then `fetchUserInfo`
- Clears the scratch space (keeping `post_login_redirect` for the caller),
  returns `AuthSession`

### usecases/auth/logout.usecase.ts
- Clears the local session via an injected `clearSession` callback
- Hands control to the IdP `/logout` endpoint with a `post_logout_redirect_uri`,
  both supplied by `IAuthNavigationPort`

### models/dm.ts
- `mergeMessageHistory(cached, history)` — the one rule for folding REST
  history into a cached timeline: dedupe by id (the cached copy wins, it is
  the decrypted one), then order by `createdAt`. History is not "always
  older": the timeline cache is persisted, so a message sent while this
  device was away comes back through history and is the newest of all.
  Generic over `TimelineEntry` so each client keeps its own message shape.
- `Decryption.undecrypted` marks a peer's message this device couldn't
  decrypt, cached as a placeholder. The decrypted copy of it, from history or
  live, takes its place and keeps what only the cache knew (its reactions) —
  in `mergeMessageHistory` and `addToTimeline`, the live push. A failed
  decrypt deletes no key, so history tries it again.
- `findConversation(list, ref)` — what a route param names: a conversation
  id, or a peer's address, which designates the 1:1 with them only. A group
  carries its first member's address too, so a plain address match would open
  the group instead of the private conversation.
- `startsConversation(ref)` — a ref the list doesn't hold opens a new 1:1 only
  when it is an address. A group id never does: a group the user isn't in
  shows as unavailable instead of minting a conversation for it.
- `interleaveTimeline(messages, events)` — a group's changes between its
  messages: the messages keep their order, each change goes before the first
  message from after it.
- `SendStatus` — an own message's lifecycle. `failed`: the IdP never accepted
  it, retried in place. `undelivered`: the IdP stored it but couldn't reach the
  recipient's IdP; the row stays as the record of that attempt and the retry
  goes out as a new message (`resent` then hides the retry).
- `applyFederationStatus(message, federationStatus, at)` — the IdP's delivery
  outcome (`dm_delivery_failed` live, `federation_status` from history)
  overrides the client's status: the IdP never retries, so it is final.
- `awaitsResend(message)` — whether an own message still offers a retry.
- `settleStaleSend(message, now)` — a send `sending` for longer than
  `SEND_TIMEOUT_MS` becomes `failed`: a page closed mid-send leaves it
  `sending` in the cache. Every DM goes out over `POST /api/dm`, whose answer
  settles it; the WebSocket only carries the echo.
- `reconcileOptimistic(optimistic, confirmed)` / `resentCopies(messages)` — the
  `resentFrom` link from a resent copy to the undelivered message it replaced
  survives reconciliation, and is looked up the other way for "Sent again at".

### models/user-settings.ts + ports/user-settings.port.ts + usecases/user-settings/
- Two scopes. `AccountSettings` (`appearance: { family, motif }`,
  `notifications: { muteAll, muteAllUntil, mutedConversations }`) follow the account to
  every device; `DeviceSettings` (`mode`) stay on the device.
- `ModePreference` is `system | dark | light`; `resolveMode(preference,
  systemPrefersDark)` gives the painted `ThemeMode`. A theme is the pair
  `family-mode` (`themeId`) — each palette re-specifies its light values.
- `parseAccountSettings` / `parseDeviceSettings` validate a stored value field
  by field; `mergeAccountSettings` applies a partial change per section.
- `IUserSettingsStorePort` — this device's store: its own settings plus its
  copy of the account's, raw on read. `load-user-settings` parses both;
  `update-account-settings` merges and saves; `update-device-settings` saves.
- The copy tracks **which sections** are unsynced, and a push sends only
  those. The IdP replaces each section it is sent, so a whole-document push
  from a device with a stale palette would undo a mute made elsewhere, and
  the other way round. A copy saved before sections were tracked
  (`synced: false`) reads as an unsynced `appearance`.

### models/mute.ts
- `isMuteAllActive(notifications, now)` — "mute all" with a `muteAllUntil`
  (epoch ms) lifts once it passes, on every device, with nothing written;
  `null` lasts until unmuted. `notificationsAt(notifications, now)` is the
  settings as they apply then: what `useNotificationSettings` hands out,
  read against a clock the provider ticks when the mute lapses.
- `isConversationMuted(notifications, id)` — muted on its own, or everything
  is. The conversation menus (`useConversationMute`) read
  `mutedConversations` directly instead, so "Unmute" never shows for a mute
  only "mute all" imposes. A friend's menu mutes the private DM with them
  (`findConversation` by address).
- `setConversationMuted(notifications, id, muted)` — idempotent toggle.
- `shouldPingForMessage(notifications, id, myStatus, senderBlocked)` — the
  incoming-message sound: silent in DND, in a muted conversation, or from
  someone blocked. A muted conversation also gets no server-strip bubble, but
  keeps its unread pill in the list.

### models/block.ts + ports/privacy.port.ts + usecases/privacy/
- The IdP enforces blocks and the contact setting; the client only keeps
  what still reaches it quiet. A group message from someone blocked arrives
  (the group is shared), so it gets no ping, no live unread and no typing —
  `countsAsUnread`, `shouldPingForMessage`. The IdP leaves them out of
  `unread_count` already.
- `blockedAddresses` keys the list by address and `isBlocked` takes either
  form, since the WebSocket names people by actor URI and the UI by address.
- Unblocking restores nothing: a friendship the block ended stays ended.

### models/profile.ts + usecases/user/get-profile-card.usecase.ts
- `ProfileCard` — `GET /api/profiles?actor=`, what the IdP shows the viewer of
  another account: pronouns, bio, `friends_since`. `IUserPort.getProfileCard`
  reads a `404` as `null`, an account elsewhere the viewer shares neither a
  friendship nor a conversation with — the card then claims no friendship
  instead of failing.
- `pronounsLabel` — "he / him", "she / her", "non-binary", as the profile
  editor offers them.

### A user's devices bring each other into their groups
- `devicesToAdd(leaves, me, devices)` (`models/group.ts`) — the user's
  devices a group holds no leaf for.
- `add-own-devices.usecase.ts` — offers each conversation the user's
  other active devices, one at a time, and names the ones that failed
  (the hook logs them; the domain doesn't). `IE2eePort.addOwnDevices`
  adds them only to groups this device holds. See
  `identity-provider/specs/e2ee.md § 6.2`.

### models/idp-error.ts
- `IdpError` — a refusal as the IdP sent it: status, `error` code, the
  `error_description` as the message, and the `actor_uri` it names (the
  group invitee who can't be added). `@pinai/api` builds it (`idpErrorFrom`)
  so the UI matches on the code, never on the words.

### usecases/e2ee/distribute-group-keys.usecase.ts
- Keys new group members one at a time: concurrent Add commits race the epoch.
- An invitee whose instance hands out no KeyPackage (`KeyPackageUnavailable`
  in `models/group.ts`, thrown by `@pinai/crypto` around the claim) is taken
  off the group again, so its roster stops naming someone who can never read
  it. A refused claim — they blocked the creator, or don't admit them — lands
  here. A failure past the claim keeps the member: the MLS state may hold them.

### models/group-event.ts
- `GroupEvent` — a change to a group (`created`, `added`, `removed`, `left`,
  `renamed`, `role_changed`) as the IdP pushes it in `group_event` and lists it
  in the history; `ConversationHistory` (`models/dm.ts`) carries a page's.
- `describeGroupEvent(event, me)` — the line the conversation shows, worded
  for the reader: "Alice removed you", "You added Dave", "Alice stepped down
  as admin". The handle stands in for a name only when the IdP has none.

### A group the user was removed from
- `DmConversationSummary.removed_at` — the group stays listed as it stood,
  with its history up to the removal; nothing can be sent to it.
- `dismiss-group.usecase.ts` — `DELETE /api/groups/:id` first, then
  `IE2eePort.forgetGroup` drops its MLS state; a refusal keeps the keys.

### Leaving a group's MLS state with its roster
- `leavesToRemove(leaves, roster, me)` (`models/group.ts`) — every device of
  someone the roster no longer holds; nothing when the roster doesn't hold
  `me`, a view of the group that isn't the user's.
- `remove-group-member.usecase.ts` — the REST removal first (the IdP checks
  it), then `IE2eePort.pruneGroup` with the roster that remains. A prune that
  fails doesn't undo the removal (`cutOff: false`): the next look finishes it.
- `reconcile-group-keys.usecase.ts` — what a leave can't do for itself, and a
  removal cut short: an admin's client prunes on `member_removed` and when
  the group opens. Other members leave it to admins, so fewer clients race
  for an epoch. See `identity-provider/specs/e2ee.md § 6.8`.

### models/identity.ts
- `actorUriToAddress(uri)` — only sanctioned converter between
  `http(s)://<host>/users/<handle>` (canonical AP/backend form) and
  `<handle>@<host>` (UI form). Always import from here; never hand-parse `@`
  or `URL` elsewhere.
- `addressParts(address)` — `{ handle, host }`, split at the last `@`; the
  host tells a local person from a federated one.

### models/presence.ts
- `UserStatus` — presence as the UI models it (`online | idle | dnd |
  invisible | offline`); domain vocabulary because `setPresenceUseCase`
  takes it
- `PresenceState` (`online | away | offline`), `PresenceSnapshotEntry`,
  `PresenceUpdatePayload`, `TypingEventPayload`
- `presenceToUserStatus()` maps presence → UI `UserStatus` (away → idle)

### ports/presence.port.ts
- `IPresencePort.getPresence(idpUrl, token, actorUris[])` —
  `GET /api/presence?actors[]=...` (URIs only; backend rejects nothing but
  takes only the canonical form)

### usecases/presence/
- `get-presence-snapshot.usecase.ts` — initial state on page load
- `send-heartbeat.usecase.ts` — pumps `{ type: "heartbeat" }` over WS every 30s
- `send-typing-start.usecase.ts` — emits `{ type: "typing_start" }`,
  rate-limited to 1/s per conversation

### usecases/auth/ensureAuthenticated.usecase.ts
- Guards access to protected routes
- Already authenticated → returns immediately
- Token gone + `idpUrl` known → delegates to `startLoginUseCase` (silent re-auth via IdP session cookie)
- No `idpUrl` → throws so the caller can redirect to the landing page
