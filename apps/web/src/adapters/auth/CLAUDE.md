# Auth Adapter — the browser half

What is left here after the OIDC flow was split up: the parts that are
genuinely this platform's. The use cases live in `@pinai/domain`, free of
browser globals, and take these through `AuthPlatform`; the HTTP client is
`OidcAdapter` in `@pinai/api`.

So this directory is Web Crypto, `sessionStorage` and `window.location` —
and it is the list a React Native app has to reimplement for auth.

## Files

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
  the only auth code that touches it (the splash screen keeps its own
  loop state there, in `presentation/_libs/splash-screen.ts`). `sessionStorage` not
  `localStorage`: the PKCE verifier is single-use and must not outlive
  the tab. No access token ever goes here.

(`isTokenValid` lives in `@pinai/domain/models/auth` — it is a business rule
about session validity, not a technical adapter.)
