# Pīna'i — web client

The browser client for [Pīna'i](https://github.com/Pina-i), a self-hostable,
federated, open-source Discord alternative. It talks to an **identity
provider** over HTTP and WebSocket, and messages are end-to-end encrypted with
MLS (RFC 9420) — encryption and decryption happen here, in the client, and the
server never sees plaintext.

This repository is a pnpm workspace. The backend lives separately, in
[`Pina-i/pinai`](https://github.com/Pina-i/pinai).

- [Install the desktop app](#install-the-desktop-app) — Windows, macOS and Linux
- [Host the web app](#host-the-web-app) — serve it for your community, on its own server or beside your instance
- [Development](#what-you-need) — run it from a checkout

---

## Install the desktop app

Download it from "Get the client" on the landing page, or from the
[latest release](https://github.com/Pina-i/pinai-client/releases/latest). One file
per system. The landing offers the first three; the ARM Linux file is on the
release page:

| System | File |
|---|---|
| Windows | `Pinai-Setup.exe` |
| macOS, every Mac | `Pinai.dmg` |
| Linux, Intel or AMD | `Pinai-x86_64.AppImage` |
| Linux, ARM | `Pinai-arm64.AppImage` |

On Linux, make the file executable (`chmod +x Pinai-x86_64.AppImage`), then
run it. On its first launch it adds Pinai to your applications menu: deleting
the file hides the entry, and an entry you remove stays gone. Tools like Gear
Lever may add a second one.
On Ubuntu, install FUSE 2 first: `sudo apt install libfuse2t64` (`libfuse2` before 24.04).

The app is not signed yet, so your system asks before it opens it:

- **Windows:** SmartScreen says it protected your PC. Choose "More info", then
  "Run anyway".
- **macOS:** open the app once, then go to *System Settings → Privacy & Security*
  and choose "Open Anyway". Until the app is signed, macOS asks for the keychain
  password ("Pinai Safe Storage") after each update: allow it ("Always Allow").

It looks for a new version every few hours. On Windows and Linux it downloads the
update by itself, tells you, and installs it when you restart or quit. On macOS it
only tells you that a new version is out, and you download `Pinai.dmg` again.

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
    image: ghcr.io/pina-i/pinai-web:${PINAI_WEB_VERSION:-0.2}
    restart: unless-stopped
    read_only: true
    # On loopback unless BIND_ADDRESS says otherwise: ports Docker publishes skip
    # the host's firewall. 8081, so that an instance beside it keeps 8080.
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${PORT:-8081}:8080"
    environment:
      PUBLIC_ORIGIN: https://${DOMAIN:?set it in .env}
      KLIPY_API_KEY: ${KLIPY_API_KEY:-}
    # Docker keeps container logs forever by default.
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

**2. `.env`**, beside it, names the app's domain; the rest is optional:

```sh
DOMAIN=app.example.org

# Optional
# The port the app is published on, on 127.0.0.1, for your proxy: 8081 unset.
PORT=8091
# Enables the GIF picker (https://docs.klipy.com): no GIFs unset. Every browser
# that loads the app receives it, so it is no secret.
KLIPY_API_KEY=your-klipy-key
```

People type their instance's address, and the app remembers the last one; a link to
`/?instance=chat.example.org` fills it in. `deploy/.env.example` lists every setting.

With `PORT` set, your proxy sends to `127.0.0.1:<PORT>`; unset, 8081 leaves 8080 to an
instance's bundle, so both fit on one server. For a proxy on another machine, set
`BIND_ADDRESS` to an address of this server that only the proxy reaches, a private
network's: ports Docker publishes skip the host's firewall, so `0.0.0.0` would serve
the app in plain HTTP to anyone.

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
to that instance's own sign-in page.

If you are running `Pina-i/pinai` locally, type `localhost:8088`, where the backend's
compose file puts the identity provider; the landing remembers the last address you
continued to.

## Commands

Run these from the repository root. Turborepo fans them out across the
workspace and caches the results — a second `pnpm build` with nothing changed
replays it all from the cache but the desktop app, built again every time: its
renderer comes from outside `apps/desktop`.

| Command | What it does |
|---|---|
| `pnpm dev` | Build the WASM bundle if stale, then start Vite on :5173 |
| `pnpm dev:desktop` | The same client in an Electron window — also on :5173, so not alongside `pnpm dev` |
| `pnpm --filter @pinai/desktop build` | The desktop app built into `apps/desktop/out`, loading `app://pinai/`; `apps/desktop/CLAUDE.md` says how to run it |
| `pnpm build` | Type-check and build to `apps/web/dist`, and the desktop app to `apps/desktop/out`. Needs `PUBLIC_ORIGIN` (see `apps/web/.env.example`): the origin the build is served from, written into its `/oauth-client.json` |
| `pnpm --filter @pinai/desktop package --linux` | After a `build`: the installers, into `apps/desktop/dist` |
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
apps/desktop        Electron shell around apps/web.
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
| `VITE_KLIPY_API_KEY` | Enables the GIF picker. Without it the picker renders a note saying so. |
| `PUBLIC_ORIGIN` | Required by `pnpm build`: the origin the build is served from, written into its `/oauth-client.json`. The dev server answers for the host it is reached on instead. |

The published image is built without them, so that one image serves every
deployment: it reads `PUBLIC_ORIGIN` and `KLIPY_API_KEY` from
the container's environment and serves them, at each request, in
`/oauth-client.json` and `/config.js` (`docker/Caddyfile`). What `/config.js` sets
wins over the build's values; `apps/web/public/config.js`, the one a checkout
serves, sets none.

Sensitive configuration is supplied by the user at runtime, never baked into
the build.

## Releasing

`.github/workflows/ci.yml` first runs the checks: the MLS engine built once, then
`pnpm lint`, `pnpm typecheck`, `pnpm test`, the desktop app's build and the
crate's `cargo test`. Then it builds the image from `docker/Dockerfile` for amd64
and arm64, and packages the desktop app on a runner of each system (a pull
request packages Linux x64 only). A `main` run's installers can be downloaded
from its run page for 3 days, to try them before a release. What it publishes to
`ghcr.io/pina-i/pinai-web` depends on what triggered it:

| Trigger | Published |
|---|---|
| A pull request | nothing |
| A push to `main` | `edge` and `sha-<short>`, for testing only |
| A tag `vX.Y.Z` | `X.Y.Z`, `X.Y` and `latest`, the four installers (`Pinai-Setup.exe`, `Pinai.dmg`, the two AppImages) with the files the app updates from (`latest*.yml`, `Pinai-mac.zip`), then the GitHub release |
| A tag `vX.Y.Z-rc.1` | `X.Y.Z-rc.1`, the installers, then a pre-release |

The web app and the desktop app ship as one version: `apps/web/package.json` and
`apps/desktop/package.json` always carry the same one, and a tag must name it, or
a release candidate of it. Every run checks both.

[release-please](https://github.com/googleapis/release-please)
(`.github/workflows/release-please.yml`, configured by `release-please-config.json`)
sets that version and makes the tags, from commit messages written as
[Conventional Commits](https://www.conventionalcommits.org). On every push to
`main` it opens or refreshes a release PR, which sets the next version and adds
its section to `CHANGELOG.md`. Merging that PR tags `vX.Y.Z` with a draft
release, which `ci.yml` publishes once the image and the installers exist.
The optional `KLIPY_API_KEY` repository secret turns on GIFs in the desktop app.

- **The version.** In 0.x, a breaking change (`feat!:`, a `BREAKING CHANGE:`
  footer) opens a new minor, anything else a patch. `deploy/compose.yaml` follows
  its minor's latest patch.
- **A new minor.** Every run checks that the default of `PINAI_WEB_VERSION` in
  `deploy/compose.yaml` (`${PINAI_WEB_VERSION:-X.Y}`) names the version's minor.
  The release PR of a minor therefore fails until you push to its branch a commit
  that sets it, with the file copied into this README. Merge right after:
  release-please rewrites its branch at the next push to `main`.
- **A release candidate.** Tag the head of the release PR with its version and
  push the tag; the run publishes a pre-release:

  ```bash
  git fetch origin release-please--branches--main--components--pinai-client
  git tag -a v0.2.0-rc.1 FETCH_HEAD -m "v0.2.0-rc.1" && git push origin v0.2.0-rc.1
  ```

release-please authenticates as the `pinai-release-plz` GitHub App, as in
`Pina-i/pinai`: unlike `GITHUB_TOKEN`, its token runs `ci.yml` on the release PR
and on the tag. The App must be installed on this repository, with its client ID
in the `RELEASE_PLZ_CLIENT_ID` variable and a private key in the
`RELEASE_PLZ_PRIVATE_KEY` secret.

To try the image from a checkout:

```bash
docker build -f docker/Dockerfile -t pinai-web .
docker run --rm -p 8090:8080 -e PUBLIC_ORIGIN=http://localhost:8090 pinai-web
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
