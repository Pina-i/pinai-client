# syntax=docker/dockerfile:1.7
#
# The web app, served by Caddy on :8080 as the non-root user 65532. Build context: the
# repository root — the workspace, and crypto/openmls-wasm for the MLS engine.
#
# The files are the same for every platform: they are built once, on the build machine,
# and only the last stage is per platform. It runs nothing, so arm64 needs no emulation.
#
# One image serves every deployment: the container's environment names it, at each
# request, in /oauth-client.json and /config.js (docker/Caddyfile).

# ── The MLS engine, compiled to WebAssembly ──────────────────────────────────
FROM --platform=$BUILDPLATFORM rust:1.98.1-trixie AS wasm
RUN rustup target add wasm32-unknown-unknown \
    && cargo install wasm-pack --version 0.15.0 --locked
WORKDIR /build/crypto/openmls-wasm
COPY crypto/openmls-wasm/ ./
RUN wasm-pack build --release --target web --out-dir ../openmls-pkg

# ── The web app ──────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:24-trixie-slim AS web
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /build
# The store from the lockfile alone, so a source change doesn't download it again.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY apps/ apps/
COPY packages/ packages/
COPY scripts/ scripts/
# Without the crate's sources, scripts/build-wasm.mjs finds the package current and
# doesn't look for wasm-pack.
COPY --from=wasm /build/crypto/openmls-pkg/ crypto/openmls-pkg/
RUN pnpm install --offline --frozen-lockfile --filter "@pinai/web..."
# A stand-in origin, replaced in the document by the container's at each request.
RUN PUBLIC_ORIGIN=https://public-origin.invalid pnpm --filter @pinai/web build \
    && sed -i 's|https://public-origin.invalid|{{env "PUBLIC_ORIGIN"}}|g' apps/web/dist/oauth-client.json

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM caddy:2.11-alpine
COPY --from=web /build/apps/web/dist/ /srv/
COPY docker/config.js /srv/config.js
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/pinai-web
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["pinai-web"]
