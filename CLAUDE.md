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
| Package manager | **pnpm** workspaces (`pnpm-lock.yaml` is the committed lockfile; do not add `package-lock.json` or `bun.lock`) |
| Monorepo | **Turborepo** — `pnpm run build` / `test` / `typecheck` fan out to the workspace members; `pnpm run lint` runs once from the root over everything |
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
pinai-client/                 # pnpm workspace root
├── pnpm-workspace.yaml       # members: apps/*, packages/*
├── turbo.json                # build / test / typecheck fan-out
├── eslint.config.js          # one config for the whole workspace — the layer
│                             #   rules are cross-cutting, so they live here
├── crypto/                   # Out-of-app crypto bundles (E2EE Phase 4+).
│   ├── openmls-wasm/         #   Standalone Cargo project: `openmls` WASM wrapper.
│   │                         #   Pinned to openmls 0.8.1; single ciphersuite
│   │                         #   (MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519).
│   │                         #   Built automatically: apps/web's `dev`, `build`,
│   │                         #   `test` and `typecheck` scripts chain
│   │                         #   scripts/build-wasm.mjs, which rebuilds only when
│   │                         #   src/, Cargo.toml or Cargo.lock are newer than the
│   │                         #   output. `pnpm run wasm --force` to force.
│   │                         #   Directly: `./build.sh`. `cargo test` runs native
│   │                         #   unit tests.
│   │                         #   Lives at the root, not inside apps/web: the native
│   │                         #   build for React Native will consume the same crate.
│   └── openmls-pkg/          #   Generated npm package — wasm-pack output.
│                             #   ~1.5–2 MiB .wasm + JS glue + .d.ts. Never
│                             #   committed — wasm-pack writes a `.gitignore` of `*`
│                             #   into it, so a fresh clone MUST build before the
│                             #   client will start.
├── scripts/build-wasm.mjs    # Staleness-checked wasm build. Needs `wasm-pack` on
│                             #   PATH, so it needs a Rust toolchain wherever it runs.
├── packages/
│   ├── api/                  # @pinai/api — the IdP's HTTP + WebSocket surface.
│   │                         #   Depends on domain + ky. Nothing browser-only.
│   ├── mls/                  # @pinai/mls — the MLS engine, one implementation
│   │                         #   per platform. `leaf-credential.ts` is shared by
│   │                         #   all of them (those bytes travel to peers);
│   │                         #   `wasm.adapter.ts` is the only importer of
│   │                         #   openmls-wasm. The native binding lands here.
│   ├── crypto/               # @pinai/crypto — the E2EE core: MLS orchestration,
│   │                         #   identity, recovery, pairing, attestation,
│   │                         #   attachment sealing, the sealed store's schema.
│   │                         #   All @noble, never crypto.subtle.
│   └── domain/               # @pinai/domain — models, ports, use cases.
│                             #   No dependencies at all, so an import of
│                             #   anything outside fails to resolve. Consumed
│                             #   as source TS; `exports` maps
│                             #   `@pinai/domain/<path>` to `src/<path>.ts`.
└── apps/
    └── web/                  # The browser client (@pinai/web)
        ├── index.html, vite.config.ts, vitest.config.ts, tsconfig*.json
        ├── public/
        ├── test/             # Vitest specs (jsdom env). `test/setup/wasm.ts`
        │                     #   compiles the real bundle the app loads, resolved
        │                     #   through node_modules/openmls-wasm.
        └── src/
            ├── adapters/     # Technical implementations (API, crypto, storage)
            ├── presentation/ # UI layer (Atomic Design)
            ├── store/        # Zustand. `store.ts` is the composition root that
            │                 #   wires this platform's persistence in; `slices/`
            │                 #   is the reusable part.
            ├── routes/       # TanStack Router routes
            ├── ioc/          # Dependency injection configuration
            └── lib/          # Layer-neutral helpers + view-model types
```

Nothing further is queued for `packages/`. The line was drawn deliberately:
what is shared is the part where a second implementation would introduce
bugs — the protocol, the crypto, the business rules. What is not shared is
the frontend — the zustand slices, the view models and the components stay
in `apps/web`, because a mobile client will not have the same screens or the
same state shape, and the state container is the first thing a stack change
would replace. Duplicating a store slice is cheap; duplicating the MLS
ratchet is not.

If any of that ever does want sharing, the thing to lift is the *rules* —
reaction folding, optimistic reconciliation, typing expiry — as pure
functions in `@pinai/domain`, not as slices. Pure functions survive a change
of state container; a slice does not.

What stays in `apps/web` for good is the platform-specific remainder — WASM,
WebCrypto, IndexedDB, web storage and navigation. `apps/mobile/` is
deliberately absent until that work begins.


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
