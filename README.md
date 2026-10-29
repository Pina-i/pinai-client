# Pīna'i — web client

The browser client for [Pīna'i](https://github.com/Pina-i), a self-hostable,
federated, open-source Discord alternative. It talks to an **identity
provider** over HTTP and WebSocket, and messages are end-to-end encrypted with
MLS (RFC 9420) — encryption and decryption happen here, in the client, and the
server never sees plaintext.

This repository is a pnpm workspace. The backend lives separately, in
[`Pina-i/pinai`](https://github.com/Pina-i/pinai).

- [Host the web app](#host-the-web-app) — serve it for your community, on its own server or beside your instance
- [Development](#what-you-need) — run it from a checkout

---

## Host the web app

The web app, from the published image `ghcr.io/pina-i/pinai-web`. It serves plain
HTTP on one port of the server, and your reverse proxy serves it over HTTPS at its
domain. It signs people in to any Pīna'i instance: an instance registers no app, it
reads the document the app publishes, `https://your.domain/oauth-client.json`.

You need:

- a Linux server, amd64 or arm64, with Docker and its Compose plugin;
- a domain for the app: `app.example.org`, say. Browsers keep each account's device,
  its keys and its message history, under the app's domain: on a new domain, every
  browser starts as a new device;
- a reverse proxy that serves that domain over HTTPS, with its certificate: Caddy,
  nginx, Traefik… An instance accepts a web app only at an `https` address. The proxy
  in front of your instance can serve both.

Then four steps on the server.

**1. `compose.yaml`.** Save this file as `compose.yaml` in an empty directory. It is
`deploy/compose.yaml`:

<!-- deploy/compose.yaml -->
```yaml
# The Pīna'i web app from the published image, in plain HTTP on one port: your
# reverse proxy serves it over HTTPS at DOMAIN.
# Its settings are in .env beside it. It stores nothing on the server.
name: pinai-web

services:
  # Identity providers know the app by https://DOMAIN/oauth-client.json, which it
  # writes from PUBLIC_ORIGIN; it refuses to start without one.
  # PINAI_WEB_VERSION in .env picks another version than this minor's latest.
  web:
    image: ghcr.io/pina-i/pinai-web:${PINAI_WEB_VERSION:-0.1}
    restart: unless-stopped
    read_only: true
    # On loopback unless BIND_ADDRESS says otherwise: ports Docker publishes skip
    # the host's firewall. 8081, so that an instance beside it keeps 8080.
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${PORT:-8081}:8080"
    environment:
      PUBLIC_ORIGIN: https://${DOMAIN:?set it in .env}
      DEFAULT_IDP_URL: ${DEFAULT_IDP_URL:-}
      KLIPY_API_KEY: ${KLIPY_API_KEY:-}
    # Docker keeps container logs forever by default.
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

**2. `.env`**, beside it, names the app's domain and the instance its landing page
offers:

```sh
DOMAIN=app.example.org
DEFAULT_IDP_URL=chat.example.org
```

Without `DEFAULT_IDP_URL`, people type their instance's address; any instance can be
reached either way. `KLIPY_API_KEY` enables the GIF picker. `deploy/.env.example`
lists every setting.

The app listens on `127.0.0.1:8081`, for a proxy on the same machine; an instance's
bundle takes 8080, so both fit on one server. `PORT` changes the port. For a proxy on
another machine, set `BIND_ADDRESS` to an address of this server that only the proxy
reaches, a private network's: ports Docker publishes skip the host's firewall, so
`0.0.0.0` would serve the app in plain HTTP to anyone.

**3. Start it:**

```bash
docker compose up -d
```

`curl http://127.0.0.1:8081/oauth-client.json` shows the document, naming
`https://app.example.org`.

**4. Route the domain to it** in your reverse proxy. The app is only files: browsers
talk to the instance directly, so the proxy needs no WebSocket or upload setting.
The app sends its own `Strict-Transport-Security`. With Caddy, which gets the
certificate and redirects `http://` by itself:

```
app.example.org {
	reverse_proxy 127.0.0.1:8081
}
```

With nginx, next to its usual redirect from `http://`:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name app.example.org;
    ssl_certificate     /etc/letsencrypt/live/app.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.org/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8081;
    }
}
```

Once `https://app.example.org` opens the app, point your instance at it: set
`WEB_APP_ORIGIN=https://app.example.org` in the instance's `.env` and run
`docker compose up -d` there. Invitations and password-reset pages then send people
to this app.

`docker compose pull && docker compose up -d` upgrades the app within its minor
version; `PINAI_WEB_VERSION` in `.env` runs another one. There is nothing to back
up: the app keeps nothing on the server.

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

The client is multi-IdP by design — you type the identity provider's address on
the landing page, it checks the instance (its NodeInfo), and Continue takes you
to that instance's own sign-in page. The field is pre-filled with
`localhost:8088`, which is where the backend's compose file puts the identity
provider, so if you are running `Pina-i/pinai` locally there is nothing to
configure.

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
| `pnpm build` | Type-check and build to `apps/web/dist`. Needs `PUBLIC_ORIGIN` (see `apps/web/.env.example`): the origin the build is served from, written into its `/oauth-client.json` |
| `pnpm test` | Run the whole Vitest suite once |
| `pnpm typecheck` | `tsc --noEmit` across the app and every package |
| `pnpm lint` | ESLint over the whole workspace (one config, at the root) |
| `pnpm run wasm` | Build the WASM bundle if stale |
| `pnpm run wasm --force` | Rebuild it regardless |
| `pnpm readme-compose` | Check that the `compose.yaml` this README shows is `deploy/compose.yaml`: change the file, then copy it into the README |

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

docker/             The published image: Dockerfile, and the Caddy that serves it.
deploy/             Hosting the web app: compose.yaml and .env.example.
```

The split is deliberate: what is shared is the part where a second
implementation would introduce bugs — the protocol, the crypto, the business
rules. The frontend is not shared.

Each of those directories has a `CLAUDE.md` explaining what lives there and
why. Start with the one at the repository root for the architecture, then
`apps/web/src/CLAUDE.md` for the conventions this codebase actually follows.

## Environment variables

Read at build time, none of them secret — this is a browser client, so anything
it can read, a user can read.

| Variable | Effect |
|---|---|
| `VITE_DEFAULT_IDP_URL` | Pre-fills the identity provider field. Defaults to `http://localhost:8088`. |
| `VITE_KLIPY_API_KEY` | Enables the GIF picker. Without it the picker renders a note saying so. |
| `PUBLIC_ORIGIN` | Required by `pnpm build`: the origin the build is served from, written into its `/oauth-client.json`. The dev server answers for the host it is reached on instead. |

The published image is built without them, so that one image serves every
deployment: it reads `PUBLIC_ORIGIN`, `DEFAULT_IDP_URL` and `KLIPY_API_KEY` from
the container's environment and serves them, at each request, in
`/oauth-client.json` and `/config.js` (`docker/Caddyfile`). What `/config.js` sets
wins over the build's values; `apps/web/public/config.js`, the one a checkout
serves, sets none.

Sensitive configuration is supplied by the user at runtime, never baked into
the build.

## Releasing

`.github/workflows/ci.yml` first runs the checks: the MLS engine built once, then
`pnpm lint`, `pnpm typecheck`, `pnpm test` and the crate's `cargo test`. Then it
builds the image from `docker/Dockerfile` for amd64 and arm64. What it publishes
to `ghcr.io/pina-i/pinai-web` depends on what triggered it:

| Trigger | Published |
|---|---|
| A pull request | nothing |
| A push to `main` | `edge` and `sha-<short>`, for testing only |
| A tag `vX.Y.Z` | `X.Y.Z`, `X.Y` and `latest` |
| A tag `vX.Y.Z-rc.1` | `X.Y.Z-rc.1` |

A tag must name the version of `apps/web/package.json`, or a release candidate of
it: the run checks it first. For a new minor, first set the default of
`PINAI_WEB_VERSION` in `deploy/compose.yaml` (`${PINAI_WEB_VERSION:-X.Y}`) to it
and copy the file into this README: the run refuses a tag `vX.Y.Z` whose minor it
doesn't name. Tag the commit of `main` whose run passed, and push the tag:

```bash
git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0
```

To try the image from a checkout:

```bash
docker build -f docker/Dockerfile -t pinai-web .
docker run --rm -p 8090:8080 -e PUBLIC_ORIGIN=http://localhost:8090 -e DEFAULT_IDP_URL=localhost:8088 pinai-web
```

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

Copyright (C) 2026 Kilian Tozzini

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along
with this program, in [`LICENSE`](LICENSE). If not, see
<https://www.gnu.org/licenses/>.

Every package here, the Rust crate under `crypto/openmls-wasm/` included, is
under this license. Anyone who serves a modified version of the web app to
users must offer them its source code (§ 13).
