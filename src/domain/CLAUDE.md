# Domain Layer

Pure TypeScript — no framework dependencies.

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

### models/identity.ts
- `actorUriToAddress(uri)` — only sanctioned converter between
  `http(s)://<host>/users/<handle>` (canonical AP/backend form) and
  `<handle>@<host>` (UI form). Always import from here; never hand-parse `@`
  or `URL` elsewhere.

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
