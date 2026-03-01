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

### usecases/startLogin.usecase.ts
- Generates PKCE verifier + challenge (S256) and random state/nonce
- Stores verifier/state/nonce/endpoints in `sessionStorage` for the redirect round-trip
- Redirects browser to IdP `/authorize`

### usecases/handleCallback.usecase.ts
- Reads `code` + `state` from URL params
- Validates `state` against sessionStorage (CSRF protection)
- Calls `IAuthPort.exchangeCode` then `fetchUserInfo`
- Clears sessionStorage, returns `AuthSession`
