# CLAUDE.md — web-client

## Project Context

This is the **browser-based frontend client** of the Pina-i platform, a self-hostable, federated, open-source Discord alternative built under the GitHub organization `Pina-i`.

This is **Layer 1** of a three-layer architecture:
- **Layer 1: Clients ← this repo**
- Layer 2: Identity & Messaging Backbone (`identity-provider/`)
- Layer 3: Chat Servers (`chat-server/`)

Layers 2 and 3 no longer live in repositories of their own — they are subtrees
of the **`Pina-i/pinai` monorepo**, spanned by a single Cargo workspace. This
client stays a separate repository: it shares an HTTP contract with those
services, not a dependency graph.

## What This Service Does

The web client is the primary user-facing interface. It communicates with **the pinai backend**:

1. **`identity-provider`** — OIDC login, user profile, friends, private DMs, presence, and the E2EE key directory
2. **`chat-server`** — community channels, messages, and roles *(planned: the subtree currently holds only its `CLAUDE.md`, is not a workspace member, and is absent from `compose.yaml`)*

A chat server attaches to exactly one identity provider and deploys alongside
it, which is why the monorepo keeps `compose.yaml` and the env templates at its
root rather than per service.

The user configures their identity provider URL (e.g. `idp.alice.com`) and the client drives the OIDC flow from there.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript |
| Framework | React 19+ |
| Package manager | **Bun** (`bun.lock` is the committed lockfile; do not add `package-lock.json`) |
| Build tool | Vite |
| UI Components | React Aria based |
| Styling | Tailwind CSS with Shadcn-style token system |
| State management | Zustand (with `persist` middleware for selected slices) |
| Data fetching | TanStack Query (React Query) |
| WebSocket | Native WebSocket API with a custom hook layer |
| Auth | OIDC Authorization Code + PKCE (no implicit flow) |
| Routing | Tanstack Router |
| E2EE | MLS (RFC 9420) via `openmls 0.8.1` WASM bundle (`crypto/openmls-wasm/`); identity + recovery via `@noble/curves` + `@noble/hashes` + `@noble/ciphers` |
| At-rest persistence | `SealedStorage` (schema + sealing) over an `IKeyValueStore`; on the web that is IndexedDB (`idb`), with AES-256-GCM under a non-extractable device key behind `IDeviceKeyPort`. The zustand cache's inner format is **msgpack** (`msgpackr`) — preserves `Uint8Array` round-trip natively |

## Related Repository

Everything this client talks to lives in **`Pina-i/pinai`** (`git@github.com:Pina-i/pinai.git`):

| Path | Role |
|------|------|
| `identity-provider/` | OIDC provider this client authenticates against; owns DMs, presence, and the E2EE key directory |
| `chat-server/` | Community servers this client connects to (planned) |
| `crates/` | Shared Rust libraries — `common-types`, `jwt-utils`, `http-signatures`, `activitypub`, `observability`, `federation-transport` |
| `specs/` | Platform-wide specs; service-scoped specs live under that service (e.g. `identity-provider/specs/`) |

Paths in this file that point into the backend are written from that monorepo's
root. Each service subtree carries its own `CLAUDE.md` — read it before working
against that service.

## Project Structure

This project follows a hexagonal architecture (Clean Architecture) with strict separation between layers:

```
web-client/
├── public/
├── locales/              # Translation files
├── crypto/                # Out-of-app crypto bundles (E2EE Phase 4+)
│   ├── openmls-wasm/      # Standalone Cargo project: `openmls` WASM wrapper.
│   │                      #   Pinned to openmls 0.8.1; single ciphersuite
│   │                      #   (MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519).
│   │                      #   Built automatically: the `dev` and `build` scripts
│   │                      #   chain scripts/build-wasm.mjs, which rebuilds only
│   │                      #   when src/, Cargo.toml or Cargo.lock are newer than
│   │                      #   the output. `bun run wasm -- --force` to force.
│   │                      #   Directly: `./build.sh`.
│   │                      #   `cargo test` runs native unit tests (happy paths only;
│   │                      #   browser-only checks land in 4b under wasm-bindgen-test).
│   └── openmls-pkg/       # Generated npm package — wasm-pack output.
│                          #   ~1.5–2 MiB .wasm (size depends on whether
│                          #   wasm-opt is enabled in the release profile)
│                          #   + JS glue + .d.ts. Imported via a `file:`
│                          #   dependency. Never committed — wasm-pack writes a
│                          #   `.gitignore` of `*` into it, so a fresh clone MUST
│                          #   build before the client will start.
├── scripts/
│   └── build-wasm.mjs     # Staleness-checked wasm build. Invokes `wasm-pack`
│                          #   from PATH, so it needs a Rust toolchain in
│                          #   whichever environment runs it. wasm-pack adds the
│                          #   wasm32-unknown-unknown target itself. Also
│                          #   re-syncs node_modules/openmls-wasm: Bun installs
│                          #   `file:` deps as hardlinked copies (npm symlinks),
│                          #   so a rebuild would otherwise leave a stale copy
│                          #   and the app would load old MLS code silently.
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
├── store/            # UI state management (Zustand). `store.ts` is the
│                     #   composition root that wires this platform's
│                     #   persistence in; `slices/` is the reusable part.
│                     #   The AES-GCM + msgpack `PersistStorage` itself lives
│                     #   in `adapters/storage/`.
├── ioc/              # Dependency injection configuration
├── translation/      # Translation system
└── config/           # Global configurations
test/                 # Vitest specs (jsdom env). Loads the real
                      #   `openmls-wasm` bundle off disk via `WebAssembly.compile`
                      #   so the MLS path runs against the same code the
                      #   browser does.
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
- **MLS E2EE is end-to-end client-driven**: encryption/decryption happens in `adapters/e2ee/`, server is opaque to message content. Per-device identity (Phase 7) — each device generates a Device Root Key (Ed25519) signed by the IdP into an attestation; peers verify via the issuer's JWKS. DRK + MLS provider state + per-device 24-word recovery passphrase all live in IndexedDB, encrypted at rest under a per-device non-extractable AES-256-GCM `CryptoKey`. The same device key encrypts the persisted message-plaintext cache (`pinai-zustand-store` IDB) so MLS forward secrecy doesn't blank conversation history on reload. The recovery passphrase derives a History Archive Key (Argon2id) used to encrypt every decrypted plaintext for opt-out server-side history backup. See `adapters/e2ee/CLAUDE.md` and `identity-provider/specs/05-e2ee.md` in the `pinai` monorepo.
- **Persistence inner format is msgpack** (not JSON). `Uint8Array` fields (`AttachmentBlobKey.key` / `.nonce`, identity bytes) round-trip natively — JSON would turn them into indexed-property objects that Web Crypto APIs reject.

## Environment Variables

```env
VITE_APP_NAME=Pina-i
VITE_DEFAULT_IDP_URL=https://idp.example.com   # optional default, user can override
VITE_KLIPY_API_KEY=                            # optional; enables the GIF picker (Klipy)
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
✅ my-component/
✅ vehicle-list.tsx
✅ add-vehicle.usecase.ts
```

```
❌ MyComponent/
❌ vehicleList.tsx
❌ addVehicle.usecase.ts
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
✅ add-vehicle.usecase.ts
✅ vehicle-api.adapter.ts
✅ http-client.helper.ts
✅ user-profile.component.tsx
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
