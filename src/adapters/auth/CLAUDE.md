# Auth Adapter

Implements `IAuthPort` using fetch + Web Crypto API.

## Files

### oidc.adapter.ts
- `OidcAdapter` — HTTP adapter for the IdP REST API
- No dependencies other than the global `fetch`

### pkce.ts
- `generateCodeVerifier()` — 48 random bytes, base64url-encoded
- `computeCodeChallenge(verifier)` — SHA-256 via `crypto.subtle`, base64url-encoded
- `generateRandomString(byteLength)` — general-purpose random string (state, nonce)
- All encoding strips padding (`=`) per RFC 7636

### token.ts
- `isTokenValid(token)` — checks JWT `exp` claim (no signature verification)
- Used by route guards to decide whether to redirect; does not belong in the store
