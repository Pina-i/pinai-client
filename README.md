# Pīna'i — web client

The browser client for [Pīna'i](https://github.com/Pina-i), a self-hostable,
federated, open-source Discord alternative. It talks to an **identity
provider** over HTTP and WebSocket, and messages are end-to-end encrypted with
MLS (RFC 9420) — encryption and decryption happen here, in the client, and the
server never sees plaintext.

This repository is a pnpm workspace. The backend lives separately, in
[`Pina-i/pinai`](https://github.com/Pina-i/pinai).

---

## What you need

| | | |
|---|---|---|
| **Node** | `^20.19` or `>=22.12` | required by `@vitejs/plugin-react` 6 |
| **pnpm** | 12.x | pinned in `package.json` as `packageManager` |
| **Rust + `wasm-pack`** | any recent stable | builds the MLS crypto bundle — see below |
| **An identity provider** | running somewhere | the client is useless without one |

`wasm-pack` is not optional. The client's MLS implementation is a Rust crate
compiled to WebAssembly, and the compiled package (`crypto/openmls-pkg/`) is
generated rather than committed — a fresh clone has nothing behind the
`openmls-wasm` dependency until it is built. Install it once:

```bash
cargo install wasm-pack
```

You do not need to add the `wasm32-unknown-unknown` target yourself; wasm-pack
does that on first run.

## First run

```bash
pnpm install
pnpm dev
```

That is genuinely all of it. `pnpm dev` builds the WASM bundle before starting
Vite, so the first run compiles openmls from source — **expect a few minutes**,
and near-instant startups afterwards, because the build is skipped unless the
crate's sources actually changed.

The dev server is on **http://localhost:5173** and the port is strict: if
something else holds it, Vite fails rather than quietly moving.

### Pointing it at a backend

The client is multi-IdP by design — you type the identity provider's URL on the
landing page and it drives the OIDC flow from there. The field is pre-filled
with `http://localhost:8080`, which is where the backend's compose file puts
the identity provider, so if you are running `Pina-i/pinai` locally there is
nothing to configure.

To pre-fill something else, copy the example env file and edit it:

```bash
cp apps/web/.env.example apps/web/.env
```

## Commands

Run these from the repository root. Turborepo fans them out across the
workspace and caches the results — a second `pnpm build` with nothing changed
finishes in under a second.

| Command | What it does |
|---|---|
| `pnpm dev` | Build the WASM bundle if stale, then start Vite on :5173 |
| `pnpm dev:desktop` | The same client in an Electron window — also on :5173, so not alongside `pnpm dev` |
| `pnpm build` | Type-check and build to `apps/web/dist` |
| `pnpm test` | Run the whole Vitest suite once |
| `pnpm typecheck` | `tsc --noEmit` across the app and every package |
| `pnpm lint` | ESLint over the whole workspace (one config, at the root) |
| `pnpm run wasm` | Build the WASM bundle if stale |
| `pnpm run wasm --force` | Rebuild it regardless |

Narrower targets, when the whole workspace is more than you need:

```bash
# one package
pnpm --filter @pinai/domain typecheck
pnpm exec turbo run typecheck --filter=@pinai/crypto

# one spec file
pnpm --filter @pinai/web exec vitest run test/e2ee.spec.ts

# watch mode
pnpm --filter @pinai/web exec vitest
```

## How the repository is laid out

```
apps/desktop        Electron shell around apps/web. Dev only for now.
apps/web            The browser client. UI, routing, and the adapters that are
                    genuinely browser-specific: WASM, WebCrypto, IndexedDB,
                    sessionStorage, window.location.

packages/domain     Models, ports and use cases. Depends on nothing at all —
                    an import of anything outside does not resolve.
packages/api        The identity provider's HTTP + WebSocket surface.
packages/crypto     The E2EE core: MLS orchestration, identity, recovery,
                    pairing, attestation, attachment sealing.
packages/mls        The MLS engine. One implementation per platform; today
                    the WASM one.

crypto/             The Rust crate (openmls wrapper) and its build output.
scripts/            build-wasm.mjs — the staleness-checked WASM build.
```

The split is deliberate: what is shared is the part where a second
implementation would introduce bugs — the protocol, the crypto, the business
rules. The frontend is not shared.

Each of those directories has a `CLAUDE.md` explaining what lives there and
why. Start with the one at the repository root for the architecture, then
`apps/web/src/CLAUDE.md` for the conventions this codebase actually follows.

## Environment variables

All optional, all read at build time, none of them secret — this is a browser
client, so anything it can read, a user can read.

| Variable | Effect |
|---|---|
| `VITE_DEFAULT_IDP_URL` | Pre-fills the identity provider field. Defaults to `http://localhost:8080`. |
| `VITE_KLIPY_API_KEY` | Enables the GIF picker. Without it the picker renders a note saying so. |

Sensitive configuration is supplied by the user at runtime, never baked into
the build.

## Troubleshooting

**`wasm-pack not found on PATH`** — install it with `cargo install wasm-pack`.
The client cannot start without the bundle, so this fails loudly and early by
design rather than surfacing later as a confusing module-resolution error.

**The app behaves as though your MLS changes did not apply.** Check that
`apps/web/node_modules/openmls-wasm` still resolves to `crypto/openmls-pkg`
itself:

```bash
readlink -f apps/web/node_modules/openmls-wasm
```

It must print the path to `crypto/openmls-pkg`. This is why `packages/mls`
depends on the bundle with pnpm's `link:` protocol and not `file:` — `file:`
copies the package into pnpm's store *behind a symlink*, and a rebuild then
leaves the app loading stale MLS code with nothing reported anywhere. If you
ever see that dependency written as `file:`, that is a bug.

**`Port 5173 is already in use`** — `strictPort` is on deliberately, so that
the OIDC redirect URI registered with the identity provider keeps matching.
Stop whatever is on the port rather than starting on another one.

**Tests and `localStorage`.** Node ships an experimental `localStorage` global
that shadows jsdom's and evaluates to `undefined`, which takes out any spec
touching the store. `apps/web/test/setup/web-storage.ts` puts a real one back,
and only when the global is missing. If tests start failing with
`Cannot read properties of undefined (reading 'getItem')`, that file is where
to look.

**`components/ui` is excluded from type-checking and linting.** It is vendored
React Aria registry output that nothing imports yet — see its own `CLAUDE.md`
before adopting anything from it.

## License

**There is no license file in this repository yet.** The project describes
itself as open source, so this is a gap worth closing — without one, the
default is exclusive copyright and nobody may legally fork, modify or
redistribute it.

The Rust crate under `crypto/openmls-wasm/` declares `MIT OR Apache-2.0` in
its `Cargo.toml`, which is the usual choice in that ecosystem and a reasonable
starting point for the rest.
