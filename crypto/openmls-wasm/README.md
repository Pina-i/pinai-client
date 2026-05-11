# openmls-wasm

Pina'i WASM bundle around [openmls](https://github.com/openmls/openmls).
Wraps the minimum MLS surface the web client uses — `KeyPackage`,
`MlsGroup` operations, `Welcome` handling, application encrypt/decrypt,
secret export — behind a strict bytes-in / bytes-out boundary.

This crate is **not** part of the `identity-provider` or `core-libs`
workspaces. It's a standalone Cargo project whose build artefact is a
generated npm package consumed by the web client (Phase 4b).

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
wasm-pack build --release --target web --out-dir ../openmls-pkg
```

The produced `../openmls-pkg/` is a self-contained npm package —
`pkg.json`, `.wasm`, `.d.ts`, JS glue. The web client imports it via a
`file:` dependency in its `package.json` (Phase 4b sets this up).

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

- **Persistence helpers.** `OpenMlsRustCrypto` is in-memory; Phase 4b
  will add IndexedDB snapshotting (encrypted at rest by a non-extractable
  Web Crypto key).
- **`wasm-bindgen-test` browser tests.** Native `cargo test` covers the
  happy paths; the browser-only checks (the `JsError` round-trip + the
  negative-decryption assertions) ride alongside the JS adapter tests
  in 4b.
- **Identity-key (MSK / SSK / USK) generation.** That's a thin layer
  over `@noble/curves` Ed25519 in the JS adapter — not the MLS engine.
