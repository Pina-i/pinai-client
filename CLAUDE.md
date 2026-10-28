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
| `crates/` | Shared Rust libraries — `jwt-utils`, `http-signatures`, `activitypub`, `observability`, `federation-transport` |
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
    ├── desktop/              # Electron shell (@pinai/desktop), dev only for now.
    │                         #   electron.vite.config.ts builds src/main and serves
    │                         #   apps/web as the renderer, loading web's own
    │                         #   vite.config.ts so plugins are never duplicated.
    │                         #   Shares :5173 with web (the port is strict), so run
    │                         #   one at a time. Its renderer is built with
    │                         #   `import.meta.env.PINAI_DESKTOP`, which hides the
    │                         #   landing's "Get the client" and swaps in the desktop's
    │                         #   sign-in (see its CLAUDE.md): the IdP's pages in the
    │                         #   app's own window, the refresh token sealed in the OS
    │                         #   keychain by the main process.
    │                         #   No packaged build yet: the renderer needs a
    │                         #   privileged scheme of its own first.
    └── web/                  # The browser client (@pinai/web)
        ├── index.html, vite.config.ts, vitest.config.ts, tsconfig*.json
        ├── components.json    # React Aria registry config for the CLI
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
            ├── lib/          # Layer-neutral helpers + view-model types
            └── components/ui # Vendored React Aria registry output. Unadopted
                              #   and unreferenced; excluded from tsc and
                              #   eslint. See its CLAUDE.md before using it.
```

Nothing further is queued for `packages/`. The line was drawn deliberately:
what is shared is the part where a second implementation would introduce
bugs — the protocol, the crypto, the business rules. What is not shared is
the frontend — the zustand slices, the view models and the components stay
in `apps/web`, because a mobile client will not have the same screens or the
same state shape, and the state container is the first thing a stack change
would replace. Duplicating a store slice is cheap; duplicating the MLS
ratchet is not.

The rules *inside* that frontend are not frontend, though. Reaction folding,
optimistic reconciliation, typing expiry, timeline ordering are business
rules, so they belong in `@pinai/domain` as pure functions that the slices
only call. Pure functions survive a change of state container; a slice does
not. See "Where does a change go?" below.

What stays in `apps/web` for good is the platform-specific remainder — WASM,
WebCrypto, IndexedDB, web storage and navigation. `apps/mobile/` is
deliberately absent until that work begins.


### Dependency principle

- The **domain** depends on nothing (pure TypeScript)
- The **adapters** depend on the domain (implement ports)
- The **presentation** (pages) uses the domain via IoC

### Where does a change go?

Decide the owning layer **before** writing a fix, by what the change *is* —
not by the file where the symptom shows up, and not by what the neighbouring
code does. Some existing code breaks this table; it is not a precedent.

| The change is… | It goes in |
|---|---|
| A rule about data — ordering, dedupe, folding, reconciliation, validation, expiry | `packages/domain/src/models/*.ts` as a pure function, spec in `apps/web/test/` |
| A flow that orchestrates ports | `packages/domain/src/usecases/` |
| The IdP's HTTP / WebSocket contract | `packages/api` |
| Protocol crypto, MLS | `packages/crypto`, `packages/mls` |
| Platform-specific code — IndexedDB, WebCrypto, web storage, navigation, WASM loading | `apps/web/src/adapters/` |
| Transversal UI state | a slice in `apps/web/src/store/slices/`: get/set only, may call a domain rule inside `set` |
| Screen logic — local state, derived values, handlers | the component's `*.viewmodel.ts` |
| Rendering and styling | the component; shared UI goes up the atomic folders |

- When the symptom's file and the owning layer differ, the fix goes in the
  owning layer and the symptom's file only calls it.
- A domain rule cannot import a web type (`apps/web/src/lib/types.ts`): make
  it generic over the structural shape it needs, as `TimelineEntry` does in
  `models/dm.ts`.
- Still to move: the dedupe, optimistic reconciliation and reaction folding
  inside `apps/web/src/store/slices/ws.slice.ts`.
- `.claude/hooks/layer-reminder.mjs` repeats this to Claude Code whenever a
  slice or a viewmodel is edited.

## Deployment

The published image, `ghcr.io/pina-i/pinai-web`, is `apps/web/dist` served by Caddy on
`:8080` as the non-root user 65532 (`docker/`). `deploy/compose.yaml` runs it behind a second
Caddy for HTTPS; the root `README.md` shows that file verbatim (`pnpm readme-compose` checks
it) and § Host the web app walks through it. `.github/workflows/image.yml` publishes `edge`
from `main` and `X.Y.Z` / `X.Y` / `latest` from a tag `vX.Y.Z`, which must name
`apps/web/package.json`'s version.

- **One image serves every deployment.** Nothing deployment-specific is built in: Caddy
  renders `/oauth-client.json` (built with a stand-in origin, replaced by
  `{{env "PUBLIC_ORIGIN"}}`) and `/config.js` (`docker/config.js`) from the container's
  environment at each request. `docker/entrypoint.sh` refuses an origin that isn't one, as
  browsers write it. `/config.js` sets `window.PINAI_CONFIG`, which
  `presentation/_libs/deployment-config.ts` prefers over the build's `VITE_*` values;
  `apps/web/public/config.js`, the one a checkout serves, sets nothing.
- **Built once for every platform.** The WASM and Vite stages run on the build machine
  (`--platform=$BUILDPLATFORM`); the per-platform stage only copies files, so arm64 needs no
  emulation.
- **The build context is the repo root**: the build needs `packages/*`, the workspace files
  and `crypto/openmls-wasm`. The web stage gets `crypto/openmls-pkg` from the WASM stage and
  not the crate's sources, so `scripts/build-wasm.mjs` finds it current and never looks for
  `wasm-pack`. `.dockerignore` keeps local `.env*` files, which can hold a Klipy key, out of
  the image.
- **SPA routing**: every path that isn't a file falls back to `index.html`. `/assets/*` is
  cached for good (Vite names it by content), everything else revalidated.

## OIDC Authentication Flow

The client is known to every IdP by the document it publishes, `/oauth-client.json`: its
`client_id` is that URL, and its redirect URIs are its own `/callback` and `/`. Nothing is
registered on an IdP, so one deployment signs users in to any of them
(`identity-provider/specs/auth.md § 1` "Clients"). `apps/web/vite.config.ts` serves the document
in dev for the host it is reached on, and writes it at build time from `PUBLIC_ORIGIN`.

The sign-in and sign-up forms, the email code and the second factor are the **IdP's own pages**:
the password is only ever typed on the server that checks it. The client has no `/login`,
`/verify-email` or `/login/totp` page; `/login` survives only as a guard that restarts a sign-in
for a known IdP.

1. User enters their IdP's address on the landing (`aotearoa.nz`, `localhost:8080`; a bare host
   is `https`, a loopback one `http` — `instanceAddress` in `@pinai/domain/models/instance`)
2. While they type, the landing reads the instance's **NodeInfo** (`/.well-known/nodeinfo`, then
   the 2.1 document it links to) and shows `✓ resolved · <nodeName> · N people`. Continue is
   enabled only for a Pīna'i instance (`software.name` = `pinai`)
3. Continue shows the hand-off screen ("Taking you to …") while the client fetches
   `/.well-known/openid-configuration` and generates PKCE `code_verifier` + `code_challenge` (S256)
4. Client redirects to IdP `/authorize` with its `client_id` and `code_challenge`; the IdP fetches
   the client's document. Once someone has signed in on this device, it also sends `theme`
   (`<family>-<mode>`, the mode as painted) and `motif`, so the IdP's pages wear this device's
   appearance; otherwise the IdP shows Black Pearl dark with Tapa 1
5. After sign-in, IdP redirects back to `/callback?code=...`; the instance joins the landing's
   "Recent" chips (3, on this device). `?error=access_denied` (the IdP's "← Another home") goes
   back to the landing silently; any other `error` shows "Sign-in failed" with its code. `state`
   is checked before either is trusted
6. Client exchanges `code` + `code_verifier` at `/token` for an access token (1 h) and a refresh
   token; the refresh token goes to `AuthPlatform.tokens` (`ISessionTokenStore`), in memory on
   the web
7. Access token stored in memory only (the auth slice, never persisted)
8. Staying signed in: `requireSession` starts `keepSessionAlive`
   (`apps/web/src/presentation/_libs/session-renewal.ts`). The access token is renewed at 80 % of
   its lifetime (`renewAfter`, `@pinai/domain/models/auth`), checked every 10 s against the wall
   clock — a timer stops while the device sleeps — and when the page comes back to the
   foreground or online. A `401` from `@pinai/api` renews once and sends the request again. The
   IdP rotates the refresh token at each use, so renewals run one at a time
   (`renewSessionUseCase`); an unreachable IdP keeps the token, tried again within the minute the
   IdP allows for a lost answer. The socket keeps going across renewals and reconnects with the
   token of the moment; a close with `1008` (its session ended) asks for a renewal. A refused
   refresh token (`invalid_grant`) means the session is over: the store is cleared and the
   browser goes through `/authorize` once, which shows the login page. A reload loses the
   refresh token: `/authorize` signs in again, silent while the IdP's browser session lives (90
   days, sliding) — the IdP signs in silently only to an app its account signed in to with the
   password, so a new client's first sign-in always asks it
9. Logout drops the refresh token, then sends `client_id` with `post_logout_redirect_uri`, which
   the document lists; the IdP ends the session, its refresh tokens with it
10. **The desktop app** shows the IdP's pages in its own window, as the web app does in its tab:
   its client is the IdP's own `/clients/desktop.json`, it asks `offline_access` (an app session
   of its own) and `prompt=login` (the window keeps the IdP's cookie), and the main process turns
   the IdP's answer to `io.github.pina-i:/callback` into the app's `/callback`. The refresh token
   is handed to the main process once, sealed with the OS keychain, renewed there; a restart
   picks the session up. Signing out revokes the token (`/revoke`).
   `AuthPlatform.browserSession` is what tells the two apart
11. Once the account's device storage is open and its E2EE device exists, `requireSession` names
   the device to the IdP (`PUT /api/sessions/current/device`, once per page load —
   `presentation/_libs/session-device.ts`): revoking the device in Settings → Devices then signs
   it out at once, and the screen tells each device's state — "Active 3 days ago", "Signed out",
   revoked — with "Sign out other devices"
12. **Sensitive actions** — revoking a device, signing out the others, turning TOTP on, clearing
   the history backup, making a member's password reset link — take a password typed in the last
   10 minutes. The IdP refuses an older
   one with `401 insufficient_user_authentication` (its `WWW-Authenticate` challenge; the `401`
   hook doesn't renew for it): `useRecentSignIn` tells the user, then `startLoginUseCase` with
   `{ reauthenticate: true, returnTo }` sends `prompt=login`, and the callback comes back where
   they were — Settings reopens on its section through `?settings=<section>`. They do it again;
   nothing is replayed. "← Another home" comes back there too, still signed in
13. **Arriving with `/?instance=<domain>`** — where the IdP sends people after an invitation's
   sign-up (its browser session open, the web app already consented to) and from a reset link's
   last page. The landing's `beforeLoad` decides, at every location (`instanceArrival` in
   `@pinai/domain/models/instance`, against the IdP the app signs in to, `idpUrl`; instances are
   the same by their authority, `host[:port]` — `sameInstance` —, whatever the scheme;
   `arriveAtInstanceUseCase`; `presentation/_libs/instance-arrival.ts`):
   - not signed in: the landing with the instance filled in and resolved, as if typed, and
     Continue focused — the field instead when it doesn't resolve. One click; never a redirect to
     `/authorize` by itself, so the official web app can't lend a link to any instance's sign-in
     page its name. After an invitation, that click signs in without the IdP's page;
   - signed in to another instance: that session is dropped at once, on this device only, as a
     refused refresh token drops it — the refresh token cleared, then the store's session and
     the IdP forgotten in one `set` (`leaveIdp`); no IdP logout, so that instance's browser
     session lives on, and the account's `pinai-e2ee:<actor>` and `pinai-zustand-store:<actor>`
     stay as they are (the cache guard below keeps that early `set` off them). Then the landing
     as above;
   - signed in to that instance: on to the app, `/home`, whose guard goes to its `/authorize` —
     silent while its browser session lives, else its login page. The one exception to "one
     click", and no phishing risk: the device chose that instance itself, and the reset page's
     "changed" link points there;
   - anything that isn't an address: the landing as usual.

   The landing takes the parameter, then drops it from the URL: a sign-in started there comes
   back to that URL. The desktop app ignores it: no link opens it

## Key Design Decisions

- **Access tokens in memory only** — never `localStorage` or `sessionStorage` to mitigate XSS token theft
- **Refresh token in memory only on the web**, outside the store, rotated at each use; the
  desktop's lives in the main process, sealed with the OS keychain (`safeStorage`), and the page
  never holds it. See the flow above
- **Effects follow being signed in, not the token** — the access token changes every 48 minutes.
  An effect keys on `useAppStore((s) => s.accessToken !== null)` and reads
  `useAppStore.getState().accessToken` when it calls the IdP; anything long-lived (the socket,
  the history flusher) takes a getter. An effect keyed on the token itself would re-run at every
  renewal: a new TOTP secret mid-enrolment, the onboarding gate unmounting the app
- **PKCE mandatory** — `plain` challenge method never used
- **Multi-IdP aware** — the client is not hardcoded to a single IdP; the user's configured IdP URL is stored in `localStorage` only (not the token)
- **Two separate WebSocket connections**: one to the identity-provider (for DMs), one to the active chat-server (for channels)
- **JWT never sent to wrong backend** — the chat-server JWT and IdP session are kept strictly separate in the store
- **MLS E2EE is end-to-end client-driven**: encryption/decryption happens in `packages/crypto/`, server is opaque to message content. Per-device identity (Phase 7) — each device generates a Device Root Key (Ed25519) signed by the IdP into an attestation; peers verify via the issuer's JWKS. DRK + MLS provider state + per-device 24-word recovery passphrase all live in IndexedDB, encrypted at rest under a per-device non-extractable AES-256-GCM `CryptoKey`. The same device key encrypts the persisted message-plaintext cache (`pinai-zustand-store` IDB) so MLS forward secrecy doesn't blank conversation history on reload. Both databases are kept **per account** (`pinai-e2ee:<actor URI>`, `pinai-zustand-store:<actor URI>`), so several accounts can take turns on one browser without erasing each other's device; the route guard opens the signed-in account's before the app shell mounts (`apps/web/src/adapters/storage/CLAUDE.md`). The recovery passphrase derives a History Archive Key (Argon2id) used to encrypt every decrypted plaintext for opt-out server-side history backup. See `packages/crypto/CLAUDE.md` and `identity-provider/specs/e2ee.md` in the `pinai` monorepo.
- **The persisted cache is written only over what hydration applied** (`apps/web/src/store/persist-guard.ts`,
  wired in `store.ts` through `onRehydrateStorage`). zustand's `persist` saves on every `set`,
  hydrated or not, so a `set` before what was read is in the store — the callback's `setSession`,
  the desktop's resumed session — would save the empty defaults over the account's history. Writes are dropped until hydration has applied a successful read (an empty
  database counts); after a failed read they stay dropped for that page load, and the next load
  reads again. A save whose every persisted field is the object last read or written is skipped,
  so a `set` outside the cache doesn't seal it all again — which is why slices replace a persisted
  field, never mutate it. Writes go out one at a time, the newest waiting value replacing older
  unsent ones. A row that can't be decoded is kept aside, never deleted
  (`apps/web/src/adapters/storage/CLAUDE.md`). Each binding has its own guard; switching accounts
  reloads
- **Persistence inner format is msgpack** (not JSON). `Uint8Array` fields (`AttachmentBlobKey.key` / `.nonce`, identity bytes) round-trip natively — JSON would turn them into indexed-property objects that Web Crypto APIs reject.

## Environment Variables

```env
VITE_DEFAULT_IDP_URL=https://idp.example.com   # optional; pre-fills the landing
                                               #   page field, defaults to
                                               #   http://localhost:8088
VITE_KLIPY_API_KEY=                            # optional; enables the GIF picker (Klipy)
PUBLIC_ORIGIN=https://app.example.com          # required by `vite build`: the origin the build
                                               #   is served from, written into
                                               #   /oauth-client.json. Not read in dev
```

(`VITE_APP_NAME` used to be listed here. Nothing reads it — the document title
is hardcoded in `apps/web/index.html`.)

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
