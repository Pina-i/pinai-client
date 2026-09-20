# Auth Adapter

Implements the auth ports using fetch, the Web Crypto API and browser
navigation. Everything platform-bound about the OIDC flow lives here — the
use cases themselves are free of browser globals.

## Files

### oidc.adapter.ts
- `OidcAdapter` — HTTP adapter for the IdP REST API
- No dependencies other than the global `fetch`

### pkce.ts
- `WebCryptoPkceAdapter` — `IPkcePort` over the free functions below
- `generateCodeVerifier()` — 48 random bytes, base64url-encoded
- `computeCodeChallenge(verifier)` — SHA-256 via `crypto.subtle`, base64url-encoded
- `generateRandomString(byteLength)` — general-purpose random string (state, nonce)
- All encoding strips padding (`=`) per RFC 7636

### auth-navigation-browser.adapter.ts
- `BrowserAuthNavigationAdapter` — `IAuthNavigationPort` over
  `window.location`. `navigateTo` replaces the document, so it never
  returns; callers must treat anything after it as unreachable.

### auth-session-browser.adapter.ts
- `BrowserAuthSessionStore` — `IAuthSessionStore` over `sessionStorage`,
  the only file in `src/` that touches it. `sessionStorage` not
  `localStorage`: the PKCE verifier is single-use and must not outlive
  the tab. No access token ever goes here.

(`isTokenValid` moved to `domain/models/auth.ts` — it is a business rule
about session validity, not a technical adapter.)
