# Domain Layer

Pure TypeScript — no framework dependencies.

## Modules

### models/auth.ts
- `UserProfile` — sub, email, preferred_username
- `OidcConfig` — authorization/token/userinfo endpoints
- `AuthSession` — access token + user profile

### ports/auth.port.ts
- `IAuthPort` — interface for OIDC operations
  - `discoverConfig(idpUrl)` — fetch `.well-known/openid-configuration`
  - `exchangeCode(params)` — POST to `/token`, returns access token string
  - `fetchUserInfo(endpoint, token)` — GET `/userinfo`, returns UserProfile

### usecases/auth/startLogin.usecase.ts
- Generates PKCE verifier + challenge (S256) and random state/nonce
- Stores verifier/state/nonce/endpoints in `sessionStorage` for the redirect round-trip
- Redirects browser to IdP `/authorize`

### usecases/auth/handleCallback.usecase.ts
- Reads `code` + `state` from URL params
- Validates `state` against sessionStorage (CSRF protection)
- Calls `IAuthPort.exchangeCode` then `fetchUserInfo`
- Clears sessionStorage, returns `AuthSession`

### usecases/auth/logout.usecase.ts
- Clears the local session via an injected `clearSession` callback
- Redirects to the IdP `/logout` endpoint with a `post_logout_redirect_uri`

### models/presence.ts
- `PresenceState` (`online | away | offline`), `PresenceSnapshotEntry`,
  `PresenceUpdatePayload`, `TypingEventPayload`
- `presenceToUserStatus()` maps presence → UI `UserStatus` (away → idle)

### ports/presence.port.ts
- `IPresencePort.getPresence(idpUrl, token, addresses[])` —
  `GET /api/presence?actors[]=...`

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
