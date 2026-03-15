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

This project follows a hexagonal architecture (Clean Architecture) with strict separation between layers:

```
web-client/
├── public/
├── locales/              # Translation files
src/
├── domain/           # Business core (use cases, ports, models)
│   ├── models/       # Business entities
│   ├── ports/        # Interfaces for adapters
│   └── usecases/     # Business logic
├── adapters/         # Technical implementations (InMemory, API, etc.)
├── presentation/     # UI layer (Atomic Design)
│   ├── atoms/        # Basic building blocks (Button, Input, Label, etc.)
│   ├── molecules/    # Combinations of atoms (FormField, SearchBar, etc.)
│   ├── organisms/    # Complex UI sections (Header, Form, DataTable, etc.)
│   ├── templates/    # Page layouts and structural components
│   └── pages/        # Application pages
├── store/            # UI state management (Zustand)
├── ioc/              # Dependency injection configuration
├── translation/      # Translation system
└── config/           # Global configurations
```

### Dependency principle

- The **domain** depends on nothing (pure TypeScript)
- The **adapters** depend on the domain (implement ports)
- The **presentation** (pages) uses the domain via IoC

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

## Zustand Store Shape

Must use the slice design pattern. Must only store transversal UI state or values (not business logic).

For example the AuthSlice:
```ts
interface AuthSlice {
    /** Access token kept in memory only — never persisted to localStorage. */
    accessToken: string | null
    user: UserProfile | null
    /** The IdP base URL persisted to localStorage so logout redirect survives page reload. */
    idpUrl: string | null

    setSession: (accessToken: string, user: UserProfile, idpUrl: string) => void
    clearSession: () => void
}
```

We could imagine in other slices, store values like : selectedChatServer, sidebarView, etc...

- Prefer local state in the React components, but when it becomes too tedious to give a value from a React component to another one, put it in the store in the appropriate slice.

## Display Name Rule

**Never display `username` or federation handles to users. Always use `display_name`.**

- `username` (the part before `@` in a federated address) is an internal federation identifier. It must never appear in the UI.
- Always render the human-readable `display_name` returned by the server.
- If `display_name` is unavailable, fall back to the username part as a last resort — never as the primary path.
- This applies everywhere: DM conversation lists, message authors, friend lists, headers, avatars.

## Security Constraints

- Never store access tokens in `localStorage` or `sessionStorage`
- Never log tokens to the console in production builds
- Always use PKCE — reject any IdP that doesn't support it
- Validate `state` parameter on OIDC callback to prevent CSRF
- Validate `nonce` in the ID token claims
- Sanitize all user-generated content before rendering (use DOMPurify for any raw HTML)

## File and folder naming

#### Naming convention: kebab-case

**All folders and files** must be created using **kebab-case**:

```
âœ… my-component/
âœ… vehicle-list.tsx
âœ… add-vehicle.usecase.ts
```

```
âŒ MyComponent/
âŒ vehicleList.tsx
âŒ addVehicle.usecase.ts
```

#### Dot notation for file types

You can use **dots** to specify file types (e.g., `.usecase`, `.adapter`, `.port`):

- **Use cases**: `{action}.usecase.ts` (e.g., `add-vehicle.usecase.ts`)
- **Interfaces**: `{action}.interface.ts` (e.g., `add-vehicle.interface.ts`)
- **Ports**: `{entity}.port.ts` (e.g., `vehicle.port.ts`)
- **Adapters**: `{entity}-{implementation}.adapter.ts` (e.g., `vehicle-in-memory.adapter.ts`)
- **Models**: `{entity}.model.ts` (e.g., `vehicle.model.ts`)

Examples with dot notation:

```
âœ… add-vehicle.usecase.ts
âœ… vehicle-api.adapter.ts
âœ… http-client.helper.ts
âœ… user-profile.component.tsx
```

### 3. Use case organization

Each use case follows this structure:

```
usecases/
â””â”€â”€ vehicle/
    â””â”€â”€ addVehicle/
        â”œâ”€â”€ addVehicle.interface.ts    # Interface + IoC token
        â””â”€â”€ addVehicle.usecase.ts      # Implementation
```
