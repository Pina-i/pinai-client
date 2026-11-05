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
- `signedInRecently(token, arrivedAt?, now?)` — the password typed within `RECENT_SIGN_IN_MS`
  (9 minutes: the IdP's 10, a minute kept in hand), timed on the IdP's clock: `iat − auth_time`
  plus the time since the token arrived on this device's own clock, so a device clock set wrong
  can't loop on the password. Without the arrival (`presentation/_libs/session-renewal.ts` records
  it), either clock saying recent is taken and the IdP's `401` settles the rest. No `auth_time`,
  not recent. Read before a start over, which mints nothing without it

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
  claimed for, over the root key a sibling was approved over. `leafOrigin` —
  `forged` only when a check shows it; `unsettled` (unreachable, expired) is
  taken at its word. `UntrustedLeaf` — a leaf met in a group that failed, or
  an own-account one not trusted (`OwnLeafRefusal`), named by its
  credential's unverified word (`IE2eePort.onTrustEvent`, `trustSnapshot`).
  `sameCredential` — whether a device's own leaf carries the credential it
  would make now (`refreshOwnLeaf`).

### models/device.ts
- `DeviceListEntry` carries what another device needs to check the chain JWKS
  → attestation → root key → HPKE key itself (bytes, `null` without), the
  history generation it says it holds, and its approvals as listed — verified
  by each device, never by the list. `DeviceRootVerdict` — the root key's link
  alone, what announcing and approving rest on; `DeviceChainVerdict` adds the
  HPKE key, for sharing the passphrase (`@pinai/crypto`).
- `deviceListKey` — what a review reads of the list as one string: a refetch
  that only changed activity times compares equal.

### models/device-trust.ts
- Who each device trusts, decided by itself (`identity-provider/specs/e2ee.md § 3.9`).
  `KnownDevice` — a device by id and root key: another root key is another device.
- `approvedDevicesBy` — over the `CheckedDevice`s `@pinai/crypto` verified: a root
  chain that verifies, no revocation (listed, or seen before), an approval by the
  generation's approval key or by a device so approved, matched by its id and the
  root key the approval was checked under. Two links at most; none at all from a
  list naming an id twice (`duplicateDeviceIds`), as a lookup by id could pick
  either row. A chain `unsettled` (issuer out of reach, attestation expired)
  decides nothing. Each comes with its `Approver`: a handshake leaves approvals both
  ways, so a counted device is named only when its approval is older than the one back
  (by the listed `created_at`, `CheckedApproval.createdAt`), or there is none back; else
  the approval key. The verdict carries them (`approvedBy`), never the trust rows.
- `actsOnApproval(standing)` — only `holds` decides on approval grounds.
  `DeviceTrustVerdict` carries the generation it acted under (stale once the
  device holds another), who approved whom and the unsettled devices; `undecided`
  decides nothing. `IE2eePort.verdictSnapshot` / `onVerdict` — the last review's, kept
  only while it still acts (a check landing mid-review included), turned non-acting once the
  device no longer holds that generation.
- `judgeDevices` — what an acting review finds and keeps: the approved (itself
  included), the unsettled, every device still unapproved (`arrived` only the
  first time it is seen under that root key — a notice's business, never the
  state's), the devices seen and found approved.
- `judgeLeaf` / `firstToCommitOut` — which leaf goes: a forgery whoever the
  device; an attestation that only expired is warned of and stays; an own leaf
  an acting verdict doesn't approve (`ownLeafStanding`); the unsettled are left.
- `resetSince` / `resetByUnapproved` — a generation past the one held (holding
  none, past the newest seen) set by a device never found approved over the root
  key listed for it now, or attributed to this device when it is setting none.
  `keyChangedUnder` — the key under the generation held changed:
  `approval-key-differs`, or `key-replaced` (salt, check value).
- `TrustEvent` / `trustEventKey` — what stands, keyed by what it is about;
  `handshake-keys-refused`, a handshake peer whose keys the list doesn't show;
  `share-recipient-refused` (a partner the passphrase isn't sealed for: `root-key`,
  `hpke-key`, `attestation`) and `share-refused` (a received share left unused, by the
  check it failed; withdrawn once the device holds the words).
- `HandshakePartner` — a device approved both ways in a code handshake, with the
  root key and HPKE key the exchange gave, never the list's: the `partners` row
  (`DEVICE_TRUST_ROWS`), which 18h shares by.
- `unapprovedListed` — the listed rows an `unapproved-device` event stands for, by id
  and the root key listed now (Settings → Devices).

### models/device-roster.ts
- Settings → Devices' rules, each from this device's own verdict. `waitingDevices` — on an
  acting verdict only, newest first: the rows an `unapproved-device` event stands for, and
  one asking (a request a seat may answer) that no review judged yet; once judged, an event
  or nothing — never one approved, unsettled, failing its chain or seen revoked.
  `holdsCurrentWords` (the words shown, else "Restore history"); `holdsHistory` /
  `historyHolders` — on an acting verdict, a device it approves that says it holds its
  generation. `approverOf` — over the root key listed now; `approvedByWording` — "this
  device", a label, "your 24 words".

### models/admission.ts + check-admission, gate-this-device, register-identity
- **No way in without approval** (`identity-provider/specs/e2ee.md § 3.6`).
  `deviceAdmission(standing, partners)` — in by the passphrase (`holds`), or by a
  handshake partner (`CheckedPartner`) listed unrevoked (nor seen revoked) under the
  root key the exchange gave, at the generation this device's own check stood on
  (`no-passphrase` carries it, never below the newest seen), one of its `by: device`
  approvals verifying over this device's current root key under that exchanged key
  (`IE2eePort.checkHandshakePartners`). A mismatch other than a start over elsewhere
  (`resetCause` `unknown-change`: rollback, relabel, a key changed under its generation)
  is a lie this device caught: no partner overrides it. Out too from a list naming an id
  twice. A non-holding device's best judgement: the acting devices verify chains
  themselves before adding or sharing. `needsPartners` — the list is read only then.
- `replacedOn(standing, setter, devices)` — the reset page after a newer generation: the setter's
  label when this device found it approved (`IE2eePort.resetSetter`), else `null` ("another device").
- `decideGateRoute` — a pending key or `no-key` → `setup` (`pendingKeyRoute`, the first rule alone,
  for a page outside the gate); in → `app`; out with a
  `mismatch` → `reset`, else `new-device`. `routeRechecks` — a route change re-checks
  at most once in 30 s, never while a check runs; `forcesRecheck` — `reset-by-unapproved`,
  `key-replaced`, `approval-key-differs` re-check at once.
- `checkAdmissionUseCase` — one key read (the standing's), the list only when partners
  count; the admission recorded (`IE2eePort.recordAdmission`). `gateThisDeviceUseCase` —
  a pending key goes to setup unchecked; an IdP out of reach (`isUnreachable`) decides
  on the recorded standing and admission, so a device let in, by its words or a partner,
  reloads offline; any other failure, or nothing recorded, is thrown.
- `registerIdentityUseCase` publishes KeyPackages (`IE2eePort.register`) only once in,
  and answers the admission; a flow that has just decided it (`bootstrap-first-device`,
  `restore-history-from-passphrase`) passes it in, recorded, not read again. Paths: the
  first device after its self-approval, typed words after the approval, a code once the
  list shows the partner's approval (`ApprovedEntry`).

### models/approval-handshake.ts + ports/approval-relay.port.ts + usecases/e2ee/approval-handshake.usecase.ts
- The code handshake (`identity-provider/specs/e2ee.md § 3.10`); its bytes and
  crypto are `@pinai/crypto`'s, reached through `IE2eePort` (`startApprovalHandshake`
  → `ApprovalHandshakeSession`, `checkHandshakePeer`, `signDeviceApproval`,
  `approvesThisDevice`, `rememberHandshakePartner`).
- **A new code without the user** only when nobody answered the last one and its
  10 minutes ran out on this device's clock (`renewsByItself`): § 2 promises each
  of the instance's guesses costs the user an action. The relay's `expires_at`
  never counts — it can shorten it.
- Rules: `mayAsk` / `mayAnswer` (holding the words **settled**: approved and the
  generation reported, so the asker finds it listed at the current one); `canonicalId`
  (lowercase UUIDs, else none);
  `answerableRequests` (another device's, **unanswered**, not set aside, none
  unless acting — no clock of this device's judges them); `closedMeans`;
  `relayRefusal`, `isTooManyRequests`, `isRefusedForGood` by status and code;
  `peerAgainstList` (a list naming an id twice decides nothing); `failureShown`
  / `noteForNext` for the Door; `pollDelay` (3 → 6 → 12 → 30 s, 5 min after a
  `429`); `nextRequestAt` (8 an hour, under the relay's 10).
- `HandshakeRun` — one side of one exchange. The asker marks itself `answered`
  as soon as another device posts; its `deadline` is its own clock's. `poll`
  checks the deadline before any call. The answerer keeps the asker, then
  approves it — an ambiguous failure posted again (`204` to a repeat), one
  refused for good ending the run — then closes. The asker approves back only
  once the list shows that approval verified under the key the exchange gave.
  The answerer times out (`ANSWER_TIMEOUT_MS`); `cancel` and an answerer's
  `abandon` after it took part end the request. The session's secrets go when it
  settles; the last token held still closes after a sign-out. Approved, the answerer
  tries sharing at once when `HandshakeDeps.sharing` is wired (§ 3.11) — nothing goes
  until the asker approved it back; the `device_approved` refetch and the sync share then.
- `ApprovalAsking` — the asking page: `tick` one at a time, `nextDelay` for the
  next, `mayAsk` checked before each open, the hourly budget passed in so it
  outlives a remount; `stopped` (a code that went otherwise) and `paused` (the
  page set it aside) wait for `again`; `stop({ keepalive })` ends the request.
  `pause` ends only a request nobody answered: an exchange another device took
  part in goes on, approval included; an `again` made while a pause waits on a
  tick wins (`asks`).
- `ApprovedEntry` — the asking device once approved: `registerIdentityUseCase` until it
  is in, `nextDelay` 2 → 4 → 8 → 15 → 30 s (`enterDelay`), `waiting` past
  `STILL_WAITING_AFTER_MS` (20 s: the approving device hasn't finished), `refused` only on
  `endsTheWait` — `device_mismatch` (the page's to sign in again) or a revoked device; any
  other refusal is waited out.
- `ApprovalAnswering` — one run at a time, shared by the Door and Settings → Devices'
  waiting seats: unanswered requests, its own run kept whatever the list says, an older
  read dropped, a code tried once — its exchange begun — never tried again (`usedCodes`),
  one tab per request (`AnswerLock`), a request this side took part in never offered again,
  `not-acting` and `taken` acted on. `snapshot` is the Door's, `null` while a seat holds the
  run; `seats` (`SeatsView`): what a seat may answer (the Door's set-aside included, shown
  before this device settles), the request the Door holds, the seat's run, `busy` (an answer
  on its way — an explicit flag, cleared whatever the answer did —, a run working, the Door
  holding one) and `unsettled`. `showSeats` — the pane is up: the Door starts nothing, its
  unanswered request moves to its seat; `answerAt` — a seat answers through the same run;
  a wrong code's next request stays in the seat. `leaveSeat` — the pane went: a run under way
  (or a code waited for, unless set aside) goes on at the Door, a settled one goes, and the
  Door picks again. `seatAnswer` (`models/approval-handshake.ts`) — what a seat offers: its
  run, the Door's, its newest open request, or nothing. Errors the flows swallow go to
  `HandshakeContext.report`.

### models/bytes.ts
- `sameBytes`, `hexOf` — the models' byte helpers: the lint boundary keeps models
  off `lib/`.

### lib/one-at-a-time.ts
- `oneAtATime` — one run at a time; the calls made meanwhile are one run after it, with
  the latest arguments, answering them all. The fanout's sync and the page's one accept of
  a key share (`apps/web/src/presentation/_libs/accept-share.ts`) go through it.

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
- `devicesToAdd(present, me, verdict)` (`models/group.ts`) — the devices an
  acting verdict found approved that no verified leaf (`present`) stands for
  under that root key; none when the verdict doesn't act.
- `sync-own-groups.usecase.ts` — every conversation caught up
  (`IE2eePort.catchUp`) and its own leaf made current (`refreshOwnLeaf`, whose
  failure still lets the siblings be added); then the device list read again
  (`IDeviceDirectoryPort.listDevices`) and reviewed (`reviewDevices`), after
  the catch-ups, so an add they brought is judged on a list as new; then in
  each group the untrusted leaves committed out (`removeUntrustedLeaves`, given
  `reviewAgain`: the list read once more before the first own leaf goes on
  approval grounds, that review used from then on) and the approved siblings
  added (`addOwnDevices`). Runs with no conversation too. Names what failed;
  the hook logs it, the domain doesn't. `unclaimed` — approved siblings no KeyPackage
  could be claimed for (a device approved with the code publishes only once in, after
  the approvals that start the sync, and its upload starts none): the hook runs again
  after `unclaimedRetryDelay` (5 s → 15 s → 60 s → 5 min, then every 15 min) while any
  is left (`lib/one-at-a-time.ts` keeps runs one at a time). With `sharing` wired, an
  acting review shares the passphrase over the list it read, after the adds
  (`shareFailure`).
  See `identity-provider/specs/e2ee.md § 6.2`, § 3.9.

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
  `no-passphrase` (with the key's generation). Generations only move forward; words give the one
  generation they were kept for. `newestGenerationSeen`, `approvalCarriedOver`, `buffersForArchive`.
  `PendingHistoryKey` — a pending key with when it was written (`mintedAt`). `settlePending(pending,
  current, now)` — `keep` (it is the key in force), `send-again` (generation 1, none in force: the
  first device's), `leave` (a row written in the last `PENDING_KEY_FRESH_MS`, 2 minutes: its `PUT`,
  this tab's or another's, may still land), `erase` (anything else — a later generation's `PUT` is
  never sent by itself). `startOverGeneration(current, newestSeen)` — the one after the key in
  force, `null` unless past every generation seen (a number another device may hold is never
  reused; none after generation 1 was seen is refused too). `firstWordsShownOffline` — the setup
  page shows kept words with the IdP out of reach only for generation 1, nothing pending.
- `IHistoryArchivePort` — `getKey` (`null` before the first), `setKey` (compare-and-set:
  `history_key_conflict` for another device's), uploads naming their generation
  (`stale_history_key`), `wipeArchive` (entries only). `IDeviceDirectoryPort` —
  `approveByPassphrase`, `reportHistoryKey`.
- `set-up-this-device.usecase.ts` registers the device then names its session: setting a key,
  approving and reporting take the naming. It publishes no KeyPackage: that waits until the
  device is in (`registerIdentityUseCase`).
- `settle-pending-history-key.usecase.ts` — a pending key (minted, sealed, its `PUT` unanswered)
  settles before anything else, by `settlePending`; one kept past generation 1 is a start over whose
  answer was lost, its words kept to show. `pendingKeyTurn(deps, run)` — what writes, sends or
  settles the pending key runs in it: the settle, the start over's read-mint-`PUT`-promote (and its
  re-read after a refusal), the first device's mint and `PUT`. One at a time per engine (so per
  page), then across the account's tabs under `deps.pendingKeyLock` (`PendingKeyLock`, the web's
  `navigator.locks` keyed `pinai-pending-key:<actor>`); without one, the page's turn and the fresh
  rows' two minutes are what keep a settle off a `PUT` on its way.
- `bootstrap-first-device.usecase.ts` — the first device: no key in force, generation 1 is minted
  and sealed as pending, set, then kept, approved, reported, its KeyPackages published, and shown;
  another device's key erases it (`has-key`, nothing published). A device without words on an
  account with a key mints nothing.
- `restore-history-from-passphrase.usecase.ts` — typed words checked against the key in force, an
  empty archive or not, a key below the newest seen refused (`rolled-back`); right, the restore
  marked due, the words kept, approved and reported, its KeyPackages published, then shared
  (`shareOnceHeld`) — `kept`; `key-changed` when a generation lands meanwhile. The restore is
  `HistoryRestore`'s, so one cut short runs again.
- `approve-by-passphrase.usecase.ts` — a device that comes to hold the current passphrase
  approves itself and reports; `stale_history_key` reads the key again and answers the standing.
  `shareOnceHeld` (`share-history-key.usecase.ts`) — what a flow runs once the device holds a
  generation, after its KeyPackages: typed words, an accepted share, the startup check settling
  (`check-history-key`); failures to an injected `report`. `dueRestore` (`models/history-key.ts`)
  — a restore due under a generation runs while it is held, is moot once a later one is in force.
- `start-over.usecase.ts` — § 6.11. New words a start over set and nobody went past
  (`IE2eePort.newWordsToShow`), still the generation in force, are answered again — never a second
  start over. Else `signedInRecently` first (`recent-sign-in`, nothing minted); set up; in
  `pendingKeyTurn`, generation n+1 (`startOverGeneration`, else `rolled-back`) minted as pending and
  `PUT`. A `409 history_key_conflict` or `401 insufficient_user_authentication` reads the key again:
  in force after all, kept; else the pending key erased (`conflict` / `recent-sign-in`). Any other
  failure keeps it (trying again sends the same words, or finds them in force). Once the IdP took
  it, the start over has happened: the words kept and marked to show (`promotePendingHistoryKey({
  show })`, until `dismissNewWords`), then approving, reporting, the KeyPackages and `shareOnceHeld`
  best effort — reported, never thrown; the page-load check, the tick and the fanout redo them —, and
  `started-over` with the words. `key-changed` when another generation lands before the approval
  (the words no longer to show).
- `start-over.usecase.ts` exports its pieces for the replacement: `unseenNewWords`, `setNewGeneration`
  (`rearchive` mints the words for a re-archive and promotes them so; `over`, the generation they
  replace — another in force by then, read in the pending key's turn, is a `conflict`, the pending key
  erased), `finishNewGeneration`.
- `replace-words.usecase.ts` — "Replace my words" (Settings → Devices), `WordsReplacement`:
  - new words not gone past answered again;
  - a pending key a replacement minted, in force (its answer was lost): kept and shown, no password,
    nothing brought; any other pending key, or a standing not `holds` (checked fresh): `not-acting`;
  - `restore-due` (a restore under the generation held not applied yet), `cache-unread`
    (`cacheRead`), then `recent-sign-in`, all before anything is minted;
  - the archive brought onto this device first (`restoreHistory`, `restoredMessages`, the injected
    `applyRestored` — the restore's own apply): failing, `restore-failed`, nothing minted;
  - then the start over's flow with `{ rearchive: true, over }`: the archive erased by the `PUT`, the
    words kept, shown, approved, reported, shared — `replaced`. A conflict or `401` erases the pending
    key, its mark with it; a re-archive still due from before stays.
- `check-history-key.usecase.ts` — the pending key settled, then the standing; holding the key
  unsettled, the approval made. `start-this-device.usecase.ts` — what a page load runs: the naming,
  then that check.
- `clear-history-backup.usecase.ts` — the entries erased; the words and generation stay.

### models/key-share.ts + ports/key-share.port.ts + the key shares' use cases
- The passphrase from a holder to a handshake partner (`identity-provider/specs/e2ee.md § 3.11`);
  the bytes, seal and signatures are `@pinai/crypto`'s (`IE2eePort.sealHistoryShares`,
  `openHistoryShare`). `IKeySharePort` — `POST` / `GET /api/history/key-shares`, `null` on `404`.
- `shareCandidates` — partners listed once, unrevoked (nor seen revoked), not holding the
  generation, not forgone, carrying a `by: device` approval by this device **and** listing one by
  it on this device's row: a partner whose handshake ended before it approved back gets nothing.
  One listed under another root key than the exchange gave is refused (`root-key`) before its
  approvals are read: the list only shows approvals binding the root key it lists. `@pinai/crypto`
  verifies both approvals. `shareText` / `shareWords` — 24 lowercase words, single spaces.
- `shareRefusal` — by code: `final` (`history_key_held`, `not_the_approver`, `access_denied`,
  `not_found`, `invalid_request`), `stale` (`stale_history_key`), `later` (the rest, no answer
  included).
- `share-history-key.usecase.ts` — each share posted once a call: `final` → `forgoHistoryShare`
  (never sealed again that page load), `stale` → the key read again and nothing more sent, `later`
  → the next refresh. Called by the answerer, the sync's review and `shareOnceHeld`.
- `accept-history-share.usecase.ts` — a device not holding: its share, then the key in force (a
  share of another generation, or a key below the newest seen, is `stale`), the four checks, the
  restore marked due, the words kept (18f's `keepPassphrase`), approved, reported (the share
  deleted), KeyPackages published, then shared on. `AwaitedShare` — the restore page's wait, over
  an injected `accept` (the page's one guarded call), on `enterDelay`, `again` starting the backoff
  over; ends `kept`, `unusable` (a share failing a check: the same one would again) or `ended`
  (`endsTheWait`).
- `restore-due-history.usecase.ts` — `HistoryRestore`: one run at a time, only over a cache read
  back (`cacheReady`), the messages to an injected `apply`. Applied, the mark stays, stamped: the
  cache's write may not have landed. A later page load runs it again — idempotent, silent — and
  only then clears it. A failure stays due for the next start; a later generation makes it moot.
- `SHARE_WAIT_AFTER_IN_MS` / `RESTORE_WAIT_MS` (`models/approval-handshake.ts`) — let in by its
  partner with no share after a minute, the asking page goes on; the words kept, it waits 15 s at
  most for the restore, which carries on behind the app. `endsTheWait` — what ends an approved
  device's waits: `device_mismatch`, or a revoked device (`403 access_denied`).

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
- `edited` on an envelope — a text archived as last edited, no edit entry beside it (a
  re-archive's); `archivedText(…, edited)`, `restoredMessages` keeps the mark.
- A reaction snapshot (`reaction-snapshot`, `archivedReactionSnapshot`): a re-archive's count of one
  message's reactions, `{ target_message_id, as_of, reactions: [{ emoji, count, reacted }] }`,
  `reacted` the user's own; `as_of`, the sealing device's clock, is for information only.
  `restoredMessages` dates a snapshot by its archive row's `created_at` (`ArchivedEntry.archivedAt`,
  the IdP's clock, as the named reactions' dates are; the latest row wins) and gives its message a
  `reactionSnapshot`: the counts as the base, the named reactions dated after the row (`since`,
  oldest first) applied on top, those at or before it `counted` (their ids recorded only). A snapshot
  without a row date is left out. `snapshotsToReplay` — on the held-copy rule. A reaction made before
  the row but not counted in the snapshot (it reached the cache late, or after the run read it) is missed.

### models/history-rearchive.ts + usecases/e2ee/rearchive-history.usecase.ts
- The archive re-made from this device's cache after a replacement of the words, one conversation
  at a time, never the whole plan. `rearchiveConversations` — by id; `conversationEntries(id,
  messages, me, asOf)` — `CachedMessage` (the web `Message`'s shape), messages by instant then id,
  each a text entry (its latest text, `edited`, attachments' keys, reply) then, with reactions, one
  snapshot under `{ reactionsOf }`: its id keyed by the history key, the engine's. Left out:
  `undecrypted`, `UNDECRYPTABLE_TEXT` (`models/dm.ts`), `failed` / `sending`, no `authorAddress`, a
  message id met twice in a conversation.
- `RearchivePosition` / the cursor — the last entry the IdP took (part 0 the text, 1 the snapshot);
  `remainingAfter`, `rearchiveProgress` (messages, counted without building an entry),
  `rearchiveBatches` (one conversation, 50 at most: a `403` refuses a batch whole). `dueRearchive` —
  the restore's rule. `rearchiveRefusal` — `retry` (no answer, `5xx`, `429`, `408`;
  `REARCHIVE_RETRY_DELAYS_MS`), `stale`, `skip` (another `4xx`), `stop` (a `401`, the rest).
  `REARCHIVE_PACE_MS` between batches. `parseRearchiveDue` — the row.
- `HistoryRearchive` — one run at a time, under the injected `lock` across tabs (the cursor never
  goes back), once per page load and generation: marked tried only once the cache was read back,
  and a run that ran out of tries on no answer left untried for a later call (a reconnect). Each
  batch sealed once (`sealForRearchive`) and sent until taken (`uploadRearchive`; the IdP keeps the
  first upload of an id), the cursor kept after each; a skipped batch counted; `stale` or a key not
  held reads the key again — still held, the batch once more; a later generation `abandoned`, the
  row dropped; signed out, `signed-out`, untried; anything else `failed`, the row kept.

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
- `isUnreachable` — no answer (a failed fetch is a `TypeError`, a `TimeoutError`) or a `5xx`;
  a refusal or a nonsensical answer is not. Only it falls back to what was recorded.

### usecases/e2ee/replenish-keypackages.usecase.ts
- The KeyPackage tick (entry, every 6 h, `key_packages_low`): the attestation
  renewed when due (`identity-provider/specs/e2ee.md § 6.7`), then — only while the
  device is in (`checkAdmissionUseCase`) — `replenishKeyPackages`, which fills to the
  cap only a stash at the threshold or not listed (§ 3.5), a first batch included; a
  device out gets `status: null` and refills nothing. A failed renewal holds no refill
  up; it is answered as `renewalFailure` (the hook signs in again on
  `device_mismatch`) and tried again at the next tick. A registration bringing a new
  attestation is announced (`IE2eePort.onDeviceRegistered`).

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
  someone the roster no longer holds, every leaf whose credential names
  nobody, every leaf a check shows forged (`leafOrigin`); nothing when the
  roster doesn't hold `me`, a view of the group that isn't the user's.
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
