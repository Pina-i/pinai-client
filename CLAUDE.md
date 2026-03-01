# CLAUDE.md — web-client

## Project Context

This is the **browser-based frontend client** of the Pina-i platform, a self-hostable, federated, open-source Discord alternative built under the GitHub organization `Pina-i`.

This is **Layer 1** of a three-layer architecture:
- **Layer 1: Clients ← this repo**
- Layer 2: Identity & Messaging Backbone (identity-provider)
- Layer 3: Chat Servers (chat-server)

## What This Service Does

The web client is the primary user-facing interface. It communicates with **two distinct backends**:

1. **identity-provider** — for OIDC login, user profile, friends, and private DMs
2. **chat-server(s)** — for community channels, messages, and roles

The user configures their identity provider URL (e.g. `idp.alice.com`) and the client drives the OIDC flow from there.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript |
| Framework | React 19+ |
| Build tool | Vite |
| UI Components | React Aria based |
| Styling | Tailwind CSS with Shadcn-style token system |
| State management | Zustand |
| Data fetching | TanStack Query (React Query) |
| WebSocket | Native WebSocket API with a custom hook layer |
| Auth | OIDC Authorization Code + PKCE (no implicit flow) |
| Routing | Tanstack Router |

## Related Repositories

| Repo | Role |
|------|------|
| `pina-i/identity-provider` | OIDC provider this client authenticates against |
| `pina-i/chat-server` | Community servers this client connects to |

## Project Structure

```
web-client/
├── public/
├── src/
│   ├── auth/               # OIDC flow, PKCE helpers, token storage
│   ├── api/                # Typed API clients (idp + chat-server)
│   ├── ws/                 # WebSocket client, reconnection logic
│   ├── store/              # Zustand stores (auth, channels, DMs)
│   ├── pages/              # Route-level page components
│   │   ├── Login/
│   │   ├── Callback/       # OIDC redirect callback handler
│   │   ├── Home/
│   │   ├── Channel/
│   │   └── DMs/
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── types/              # Shared TypeScript types
│   └── main.tsx
├── docker/
│   ├── Dockerfile          # Builds static files, serves via nginx
│   └── docker-compose.yml  # Standalone deployment
├── nginx.conf              # nginx config for serving the SPA
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── .env.example
```

## Deployment

This repo ships its own `Dockerfile` and `docker-compose.yml`. The production build is a static Vite output served by nginx.

```yaml
# docker/docker-compose.yml
services:
  web:
    build: ..
    ports:
      - "80:80"
    environment:
      VITE_DEFAULT_IDP_URL: https://idp.example.com
```

The `Dockerfile` runs `vite build` and copies the output into an nginx image. The `nginx.conf` must handle SPA routing (all paths fall back to `index.html`).

## OIDC Authentication Flow

1. User enters their IdP URL (e.g. `idp.alice.com`)
2. Client fetches `/.well-known/openid-configuration` to discover endpoints
3. Client generates PKCE `code_verifier` + `code_challenge` (S256)
4. Client redirects to IdP `/authorize` with `code_challenge`
5. After login, IdP redirects back to `/callback?code=...`
6. Client exchanges `code` + `code_verifier` for tokens at `/token`
7. Access token stored in memory only (never localStorage)
8. Refresh token stored in an HttpOnly cookie (set by IdP)
9. Silent refresh via a hidden iframe or background fetch before expiry

## Key Design Decisions

- **Access tokens in memory only** — never `localStorage` or `sessionStorage` to mitigate XSS token theft
- **Refresh tokens via HttpOnly cookie** — set by the IdP, not accessible to JavaScript
- **PKCE mandatory** — `plain` challenge method never used
- **Multi-IdP aware** — the client is not hardcoded to a single IdP; the user's configured IdP URL is stored in `localStorage` only (not the token)
- **Two separate WebSocket connections**: one to the identity-provider (for DMs), one to the active chat-server (for channels)
- **JWT never sent to wrong backend** — the chat-server JWT and IdP session are kept strictly separate in the store

## Environment Variables

```env
VITE_APP_NAME=Pina-i
VITE_DEFAULT_IDP_URL=https://idp.example.com   # optional default, user can override
```

Note: no secrets belong in the frontend environment. All sensitive config is user-provided at runtime.

## Auth Store Shape (Zustand)

```ts
interface AuthStore {
  accessToken: string | null       // in-memory only
  idpUrl: string | null            // from localStorage
  user: UserProfile | null
  isAuthenticated: boolean
  login: (idpUrl: string) => void  // triggers OIDC redirect
  logout: () => void
  refreshToken: () => Promise<void>
}
```

## Security Constraints

- Never store access tokens in `localStorage` or `sessionStorage`
- Never log tokens to the console in production builds
- Always use PKCE — reject any IdP that doesn't support it
- Validate `state` parameter on OIDC callback to prevent CSRF
- Validate `nonce` in the ID token claims
- Sanitize all user-generated content before rendering (use DOMPurify for any raw HTML)

## Testing Strategy

- Unit tests for PKCE helpers, token parsing, state validation
- Component tests with React Testing Library
- E2E tests with Playwright covering the full OIDC login flow against a mock IdP
