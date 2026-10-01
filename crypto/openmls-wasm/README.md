# openmls-wasm

Pina'i WASM bundle around [openmls](https://github.com/openmls/openmls).
Wraps the minimum MLS surface the web client uses — `KeyPackage`,
`MlsGroup` operations, `Welcome` handling, application encrypt/decrypt,
secret export — behind a strict bytes-in / bytes-out boundary.

This crate is **not** part of the `pinai` Cargo workspace. It's a
standalone Cargo project whose build artefact is a generated npm package,
consumed by `@pinai/mls` and the web app.

## Pinned ciphersuite

`MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519` — the RFC 9420
mandatory-to-implement suite. Single-suite to keep the WASM bundle
small and to avoid a runtime negotiation step.

## Building

```bash
# One-time toolchain setup (skip if already done):
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# Native unit tests (Rust target):
cargo test

# Browser-targeted bundle:
./build.sh
```

You rarely need the last step by hand: `apps/web`'s `dev`, `build`, `test`
and `typecheck` scripts run `scripts/build-wasm.mjs` first, which rebuilds
only when the sources are newer than the output.

The produced `../openmls-pkg/` is a self-contained npm package —
`package.json`, `.wasm`, `.d.ts`, JS glue. `@pinai/mls` and `apps/web`
depend on it with pnpm's `link:` protocol, never `file:` — the root
`README.md` explains why a `file:` dependency leaves the app on stale code.

## Build flags

The Cargo project exposes one feature, `console_error_panic_hook`,
on by default. It surfaces Rust panics through `console.error` instead
of the silent `unreachable executed` browser failure mode. Cheap; we
keep it on for now.

## Updating openmls

`Cargo.toml` pins exact versions (`=0.8.1` etc.). `openmls` is on a 0.x
release line and minor bumps may break the wrapper. Treat upgrades as
deliberate work: bump, run `cargo test`, run `wasm-pack build`, hand-test
in the web client. See the implementation plan's "Risks / decisions
still open" section.

## What's not here yet

- **Persistence.** `OpenMlsRustCrypto` is in-memory; the provider state
  leaves as a snapshot, which `@pinai/crypto`'s `SealedStorage` keeps
  encrypted at rest.
- **`wasm-bindgen-test` browser tests.** Native `cargo test` covers the
  happy paths; the browser-only checks (the `JsError` round-trip + the
  negative-decryption assertions) ride alongside the JS adapter tests.
- **Identity-key (MSK / SSK / USK) generation.** That's a thin layer
  over `@noble/curves` Ed25519 in the JS adapter — not the MLS engine.
