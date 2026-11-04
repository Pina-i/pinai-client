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
- `UserProfile` — sub, email, preferred_username; `admin`, an admin of the
  instance (`/userinfo`)
- `OidcConfig` — authorization/token/userinfo endpoints
- `AuthSession` — access token + user profile
- `CallbackResult` — how a sign-in came back: `signed-in`, `cancelled` (the
  IdP's "Another home", `access_denied`; `returnTo` where the user was, when
  only the password was asked again) or `refused` (any other `error`, its
  code kept only when it looks like one — never the IdP's description)
- `isTokenValid(token)` — checks the JWT `exp` claim (no signature
  verification — that is the IdP's job). Used by the route guards.
- `IssuedTokens` — what `/token` answers: access + refresh token
- `renewAfter(token)` — when to renew: 80 % of the lifetime (`exp - iat`),
  counted from the token's arrival rather than its `iat`, so a device whose
  clock disagrees with the IdP's still renews on time

### ports/auth.port.ts
- `IAuthPort` — interface for OIDC operations
  - `discoverConfig(idpUrl)` — fetch `.well-known/openid-configuration`
  - `exchangeCode(params)` — POST to `/token`, returns `IssuedTokens`
  - `refresh(params)` — the refresh grant: the next pair, `null` when the IdP
    refused the token (the session is over), a rejection when it couldn't be
    reached (the token is then still good to present again)
  - `revoke(params)` — RFC 7009: the refresh token, and its session with it
  - `fetchUserInfo(endpoint, token)` — GET `/userinfo`, returns UserProfile
- `AuthPlatform` — the platform half of the flow, injected as one argument:
  - `clientId(issuer)` — this build's client at that IdP: the web deployment's
    own document, or the desktop's, which every IdP serves itself
  - `browserSession` — the app's session hangs under the browser's (the IdP's
    cookie signs it in again silently on that session, `/logout` ends it with
    the browser's, `/revoke` alone); false on the desktop, whose session is its
    own: `offline_access` and `prompt=login` at sign-in, no silent sign-in,
    sign-out by revoking its refresh token
  - `IPkcePort` — randomness + SHA-256
  - `IAuthSessionStore` — sync scratch space keyed by `AuthSessionKey`,
    surviving the hand-off to the IdP (`sessionStorage` on the web)
  - `ISessionTokenStore` — where the refresh token waits (`set`, `take`,
    `clear`): memory on the web, never web storage; the keychain on a device
  - `IAuthNavigationPort` — callback/post-logout URLs and the hand-off
  - `appearance()` — the `theme` and `motif` the IdP's sign-in pages should
    paint (`appearanceHints` in `models/user-settings.ts`): this device's,
    once someone has signed in on it (its settings copy has an `owner`),
    else nothing and the IdP shows its own. Read where the platform keeps
    the appearance, so each platform answers it

### usecases/auth/resume-session.usecase.ts
- Picks up a session the platform kept across restarts (the desktop's, in the
  keychain): a renewal, then `/userinfo`. Nothing to pick up on the web. Run by
  the route guard and the landing before anything else

### usecases/auth/renew-session.usecase.ts
- `renewSessionUseCase(authPort, platform)` — the page's one renewer:
  `renewed`, `ended` (refused, or no token held) or `unreachable` (the token
  put back)
- One renewal at a time, whoever asks — a timer, a refused request, a closed
  socket: the IdP rotates the token at each use, and a token presented twice
  outside its minute of grace ends the session

### ports/session.port.ts · usecases/auth/link-session-device.usecase.ts
- `ISessionPort` — `linkDevice` names the E2EE device this session signed in,
  so revoking the device signs it out; `signOutOtherDevices` ends every other
  session of the account
- `linkSessionDeviceUseCase` links only once the device exists: on a first
  sign-in, the onboarding creates it after the route guard first runs. It
  registers the device again first when it has to (`IE2eePort.registerDevice`:
  near the attestation's end, or no HPKE key yet), then names it — a failed
  registration all the same (answered as `registrationFailure`, tried again at
  the next page load or tick), but for `device_mismatch`, thrown
- `usecases/auth/sign-in-again.usecase.ts` — a refusal coded `device_mismatch`
  (`isDeviceMismatch`, `models/idp-error.ts`): this device's storage was wiped
  while its session lived, so the session names the device it was. The web app
  revokes its refresh token (`IAuthPort.revoke`, the token taken from
  `AuthPlatform.tokens`) and signs in at once: silent while the IdP's browser
  session lives, its next exchange opens a new session under it, and the
  browser's other web apps stay signed in. Never the IdP's logout: a renewal
  holding the token is awaited (the injected renewer joins it) and the token
  taken again; with none still, it signs in all the same, and the next page,
  holding the callback's token, revokes it. A token is revoked only at the
  endpoint discovery named, which every Pīna'i IdP does. The
  desktop clears its token, which revokes it, and signs in at once, which
  opens a new app session. Once a page: a second refusal meanwhile joins the
  first
- `deviceStatus` (`models/device.ts`) — revoked, signed in (active when its
  session was last used), or signed out and free to sign in again

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
- The leaf key before its credential (`generateSignatureKey`, then
  `setIdentity(credential, key)`), so the device's root key signs it in. What
  the leaf checks need: `inspectKeyPackage`, `groupLeaves` (`MlsLeaf`, `own`
  marked), a commit's `leavesMet`; `updateOwnCredential` for the device's own
  leaf.

### ports/hpke.port.ts
- `IHpkePort` — RFC 9180 base mode, one suite (DHKEM(X25519, HKDF-SHA256),
  HKDF-SHA256, AES-128-GCM): `generateKeyPair`, `seal` (a low-order key
  refused), `open`. Beside `IMlsEngine`, not on it: nothing of a group takes
  part. The engine's implementations supply it, from the same crate.

### models/leaf-trust.ts
- `LeafCredential` — the v2 credential, decoded (the bytes are
  `@pinai/mls/leaf-credential`'s); `LeafClaim` / `MlsLeaf` — a leaf's credential
  (`null` when it is none) and signature key.
- `LeafVerdict` / `LeafRefusal` — what `@pinai/crypto`'s checks found.
  `admitsClaim` — a claimed KeyPackage is added only as the very device it was
  claimed for. `UntrustedLeaf` — a leaf met in a group that failed, named by
  its credential's unverified word (`IE2eePort.onUntrustedLeaf`).
  `sameCredential` — whether a device's own leaf carries the credential it
  would make now (`refreshOwnLeaf`).

### models/device.ts
- `DeviceListEntry` carries what another device needs to check the chain JWKS
  → attestation → root key → HPKE key itself (bytes, `null` without), the
  history generation it says it holds, and its approvals as listed — verified
  by each device, never by the list. `DeviceChainVerdict` is
  `verifyDeviceChain`'s answer (`@pinai/crypto`).

### lib/bytes.ts
- Base64 ↔ bytes, `base64url` for JWS/JWK and padded `base64` elsewhere
- In the domain because base64 is the wire format for every binary field the
  protocol carries, so decoding it is part of speaking the protocol rather
  than a detail of any one transport. Three packages need it.
- `atob`/`btoa` are two of the four globals this package assumes
- `decodeBase64(value, length?)` — the one safe decode for what the wire hands
  over: `null` for what isn't base64, or isn't that long

### ports/key-directory.port.ts
- `IKeyDirectoryPort` — the IdP key directory + MLS Delivery Service as the
  E2EE core needs it: register the device, claim key packages, post commits
  and welcomes
- Plus the wire DTOs (`CommitView`, `WelcomeView`, `IdentityKeysResponse`,
  `RegisterDeviceResponse`), base64 already decoded to bytes
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
- `ready()` loads the key, minting it on first use, and rejects when it can't
  be read — never minting over one that exists. A storage calls it first, to
  tell a failed read from a row the key can't open

### ports/attachment-crypto.port.ts
- `IAttachmentCryptoPort` — per-attachment AES-256-GCM seal/open. Protocol
  visible: the key, nonce and AAD travel to the peer in the MLS body, so
  every implementation must agree byte-for-byte.

### usecases/auth/startLogin.usecase.ts
- `prepareLoginUseCase` — discovery, PKCE verifier + challenge (S256) and
  random state/nonce via `IPkcePort`, the scratch space in `IAuthSessionStore`,
  and the platform's appearance hints; resolves to the `/authorize` URL
  without going there, so the landing can show its hand-off first
- `startLoginUseCase` — the same, then hands control to the IdP via
  `IAuthNavigationPort` (the route guards' silent re-auth)
- `LoginOptions`: `reauthenticate` asks the password again (`prompt=login`) for
  a sensitive action, and marks the flow (`reauthenticating`) so a cancel comes
  back signed in; `returnTo` replaces the current location as where to come back

### usecases/auth/handleCallback.usecase.ts
- Reads `code` or `error`, and `state`, from URL params
- Validates `state` against the `IAuthSessionStore` (CSRF protection) before
  trusting either
- An `error` ends the flow: the scratch space is cleared but for `idp_url`
  (the landing offers it again), and the result is `cancelled` or `refused`
- A `code`: `IAuthPort.exchangeCode` then `fetchUserInfo`, the scratch space
  cleared (keeping `post_login_redirect` for the caller), `signed-in`

### models/instance.ts + ports/instance.port.ts + usecases/instance/
- What the landing knows of an IdP before any sign-in. `instanceAddress`
  turns what was typed into an origin (a bare host is `https`, a loopback
  one `http`; a host needs a top-level name or a port); `displayAddress`
  writes it back.
- NodeInfo, the fediverse's self-description: `INodeInfoPort` reads
  `/.well-known/nodeinfo` and the document it links to (2.1, else 2.0 —
  `nodeInfoHref`); `parseNodeInfo` takes the name, the account count and
  `openRegistrations`, and only from `software.name` = `pinai`;
  `describeInstance` is the landing's `✓ resolved · …` line.
  `resolve-instance.usecase.ts` chains them.
- `IRecentInstancesPort` — the instances this device signed in to, as
  origins; `parseRecentInstances` / `addRecentInstance` keep 3, newest first,
  once each. `rememberInstanceUseCase` runs when a callback succeeds.
- `ILastInstancePort` — the origin last submitted on the landing (Continue),
  what the field starts with short of an arrival. `rememberChosenInstanceUseCase`
  writes it before the sign-in starts, so a failed one keeps it;
  `loadLastInstanceUseCase` validates what it reads.
- `instanceArrival(asked, signedInTo)` — the app opened on `?instance=`:
  `none` (no address), `here` (the instance it signs in to: on to the app) or
  `pick` (the landing, filled in; `leaving` another instance). `sameInstance`
  compares authorities, `host[:port]` of `instanceAddress`, never the strings:
  `http://` and `https://` name one instance. `arrive-at-instance.usecase.ts`
  (in `usecases/auth/`) drops the other instance's session through the
  platform's token store and an injected `dropSession`, and is ignored where
  `browserSession` is false: no link opens the desktop app.

### models/gif-search.ts + usecases/instance/gif-search-key.usecase.ts
- The GIF picker's Klipy key is the signed-in instance's, handed out in its NodeInfo
  (`metadata.gifs`, `nodeInfoKlipyKey`), and no one else's: the desktop app has no deployment of
  its own, and the web app's host is not the instance's admin. No key, no picker. `klipyKey`
  admits what the IdP does: the key goes into a URL path.

### models/instance-admin.ts + ports/instance-admin.port.ts
- Settings → Instance, an admin's panel on open and invite-only instances
  alike (`managesInstance(admin, info)`). `managesRoster(info)` — the members,
  invitations and reset links, only on an invite-only one (NodeInfo
  `openRegistrations: false`): on an open one people sign up and reset their
  passwords themselves, and the IdP refuses to invite.
  `managed-instance.usecase.ts` reads NodeInfo for an admin only.
- `InstanceIntro` — the name and description as written, `null` for the
  IdP's default (the domain, no description). `introDraft` is what a save
  would send: trimmed, a blank field `null`, counted in code points as the
  IdP counts characters (`.length` counts an emoji twice), and the fields past
  `INTRO_LIMITS` (40, 90). `introPreview` — how the sign-in pages read it.
- `IInstanceAdminPort` — `/api/admin/*`: the name and description (`PUT`
  answers the text saved), the members, the open invitations, making and
  revoking one, a member's reset link. A link's token is in the answer that
  made it, never in a list: the client can't show it twice.
- `InstanceMember` names a member by display name only — the IdP never
  sends a handle or an address. `offersPasswordReset` — not to an admin,
  who recovers through `ADMIN_EMAIL` / `ADMIN_PASSWORD`. `memberActivity` —
  online, seen (a session's last use), or signed out everywhere.
- `refusedAsNonAdmin` — every admin route's `403`. `revoke-invitation.usecase.ts`
  takes a `404` as `gone` (used, expired or revoked meanwhile): the row leaves
  the list either way.

### models/relative-time.ts
- Times as the screens word them: `formatLastSeen` ("3 days ago") and
  `expiryWording` ("expires in 7 days", rounded up as the IdP's invitation
  page does, or "expired"). Both answer `null` for a date they can't read.

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
- `pingsAgain(lastPingAt, now)` — pings within `PING_SPACING_MS` (420 ms) of the
  last ring once, so a burst (a reconnect catching up) is one sound.
- `ports/notification-sound.port.ts` — `INotificationSoundPort.playDmReceived()`:
  the sound itself, Tō‘ere, is each platform's (`apps/web/src/adapters/sound/`).

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
- `sync-own-groups.usecase.ts` — for each conversation, one at a time:
  catch it up on the commits it missed (`IE2eePort.catchUp`), make its own
  leaf's credential current (`refreshOwnLeaf`, whose failure still lets the
  siblings be added), then offer
  it the user's other active devices (`addOwnDevices`, which adds them
  only to groups this device holds). Names the conversations that failed;
  the hook logs them, the domain doesn't. See
  `identity-provider/specs/e2ee.md § 6.2`.

### models/own-messages.ts
- `isHeldHere` — a message from the user's own account is this device's
  echo only when it holds a copy of it (optimistic id, server id, or an
  applied reaction). Any other came from one of the user's other devices:
  `useIdpWebSocket` and the history load decrypt it like anyone's, and
  show nothing for one that doesn't decrypt (MLS never decrypts a
  device's own).

### models/history-key.ts + the history key's use cases
- The account's passphrase in generations (`identity-provider/specs/e2ee.md § 3.6–3.9`).
  `HistoryKey` — generation, salt, check value, approval public key; `CurrentHistoryKey` adds
  `setByDevice`. `passphraseVerdict` — words hold a key only when both values are its own.
- `standingAgainst(key, kept, newestSeen, rootKey)` — `holds` (`settled` when approved over the
  device's root key as it is now, `isSettled`), `mismatch` (`check-value`, `approval-key`,
  `rollback` — a generation below the newest seen, or none after one —, `relabelled` — the kept
  generation's key under another number; the words are kept, nothing uploaded), `no-key`,
  `no-passphrase`. Generations only move forward; words give the one generation they were kept
  for. `newestGenerationSeen`, `approvalCarriedOver`, `buffersForArchive`.
- `IHistoryArchivePort` — `getKey` (`null` before the first), `setKey` (compare-and-set:
  `history_key_conflict` for another device's), uploads naming their generation
  (`stale_history_key`), `wipeArchive` (entries only). `IDeviceDirectoryPort` —
  `approveByPassphrase`, `reportHistoryKey`.
- `set-up-this-device.usecase.ts` registers the device then names its session: setting a key,
  approving and reporting take the naming. Publishing KeyPackages is its own step after it
  (`registerIdentityUseCase`).
- `settle-pending-history-key.usecase.ts` — a pending key (minted, sealed, its `PUT` unanswered)
  settles before anything else: the key in force is it → kept; none → set again; another → erased.
- `bootstrap-first-device.usecase.ts` — the first device: no key in force, generation 1 is minted
  and sealed as pending, set, then kept, approved, reported and shown; another device's key erases
  it (`has-key`). A device without words on an account with a key mints nothing.
- `restore-history-from-passphrase.usecase.ts` — typed words checked against the key in force, an
  empty archive or not, a key below the newest seen refused (`rolled-back`); right, kept, approved
  and reported, then the archive restored — `key-changed` when a generation lands meanwhile.
- `approve-by-passphrase.usecase.ts` — a device that comes to hold the current passphrase
  approves itself and reports; `stale_history_key` reads the key again and answers the standing.
- `check-history-key.usecase.ts` — the pending key settled, then the standing; holding the key
  unsettled, the approval made. `start-this-device.usecase.ts` — what a page load runs: the naming,
  then that check.
- `clear-history-backup.usecase.ts` — the entries erased; the words and generation stay.

### models/history-archive.ts
- `ArchiveEnvelope` — an archive entry before it is sealed: a message or an
  edit, its sender, its instant, and a message's attachments as the IdP
  lists them (`MessageItem` renders from that list; the keys alone show
  nothing). `archivedText` / `archivedEdit` build it; nothing else should.
- A message is archived wherever this device first holds its text: the
  send's answer (and its echo, for an answer that never came), a live
  decrypt, a decrypt on opening the conversation. An edit is its own entry
  under the id its MLS ciphertext gives (`editEntryId`: the SHA-256 digest
  as a version-8 UUID), the same wherever it is met, the edited message's
  sender as its sender. A reaction is
  its own entry under its message id (`sendReactionUseCase` answers the row),
  removals included, or a removed reaction would come back.
- `encodeArchiveEnvelope` / `decodeArchiveEnvelope` — JSON, with byte
  fields (attachment keys) written `{ $bytes: [...] }`: plain JSON turns a
  `Uint8Array` into an object no cipher takes back.
- `restoredMessages(entries)` — the archive as messages, oldest first: each
  text once, the latest of its sender's edits applied, in its conversation,
  with the reactions still on it — each reactor's last add or remove per
  emoji, so one archived twice counts once.
- `reactionsToReplay(cached, restored)` — the restore applies reactions
  through the store's `applyReaction`, which records each id: the history
  load may decrypt one again (sent after the device joined). Only for the
  messages the cache doesn't hold decrypted — a held copy wins, reactions
  included.
- `ARCHIVE_UPLOAD_LIMIT` — the IdP takes 50 entries per upload;
  `ARCHIVE_BUFFER_LIMIT` — at most 1000 wait on a device, the oldest dropped.

### models/idp-error.ts
- `IdpError` — a refusal as the IdP sent it: status, `error` code, the
  `error_description` as the message, and the `actor_uri` it names (the
  group invitee who can't be added). `@pinai/api` builds it (`idpErrorFrom`)
  so the UI matches on the code, never on the words.
- `needsRecentSignIn(error)` — the IdP asking the password again before a
  sensitive action (`RECENT_SIGN_IN_REQUIRED`, RFC 9470's
  `insufficient_user_authentication`): the user signs in again, then retries.
- `isDeviceMismatch(error)` — the session names another device
  (`DEVICE_MISMATCH`): `sign-in-again.usecase.ts`.
- `isStaleHistoryKey` / `isHistoryKeyConflict` — a generation that isn't the current one; another
  device's generation set first.

### usecases/e2ee/replenish-keypackages.usecase.ts
- The KeyPackage tick (entry, every 6 h, `key_packages_low`): the attestation
  renewed when due (`identity-provider/specs/e2ee.md § 6.7`), then the stash
  topped up. A failed renewal holds no refill up; it is answered as
  `renewalFailure` and tried again at the next tick. A registration bringing a
  new attestation is announced (`IE2eePort.onDeviceRegistered`).

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
  someone the roster no longer holds, and every leaf whose credential names
  nobody; nothing when the roster doesn't hold `me`, a view of the group that
  isn't the user's.
- `remove-group-member.usecase.ts` — the REST removal first (the IdP checks
  it), then `IE2eePort.pruneGroup` with the roster that remains. A prune that
  fails doesn't undo the removal (`cutOff: false`): the next look finishes it.
- `reconcile-group-keys.usecase.ts` — what a leave can't do for itself, and a
  removal cut short: an admin's client prunes on `member_removed` and when
  the group opens. Other members leave it to admins, so fewer clients race
  for an epoch. See `identity-provider/specs/e2ee.md § 6.8`.

### models/conversation-search.ts
- `searchConversations(sources, query)` — the DM sidebar's "Find or start a
  conversation": friends (`people`), conversations, servers and channels
  (`places`), each row on its best text (one matching at a word's start before
  one matching inside a word), rows matching at a word's start first. Only what
  the sidebar shows is searched: never message text, the last-message preview
  included.
- A friend is one row: their 1:1 is left out of `conversations` (every friend
  has one, minted when the request is accepted), so it only lists groups and
  1:1s with people who aren't friends. A group is found by a member's name too.
- `matchText` ignores case, diacritics and the ʻokina / apostrophes — names are
  written with and without them — and answers a range of the original text, so
  the mark falls on what is displayed.

### models/identity.ts
- `actorUriToAddress(uri)` — only sanctioned converter between
  `http(s)://<host>/users/<handle>` (canonical AP/backend form) and
  `<handle>@<host>` (UI form). Always import from here; never hand-parse `@`
  or `URL` elsewhere.
- `addressParts(address)` — `{ handle, host }`, split at the last `@`; the
  host tells a local person from a federated one.
- `personName(actorUri, displayName)` — the display name, the handle only
  when the person's instance has none.
- `instanceOrigin(uri)` — the instance a URL belongs to, as an origin: an
  actor's attests its devices, and names itself so in their credentials.

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
