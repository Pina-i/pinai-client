# @pinai/mls

The MLS engine, one implementation per platform.

The contract is not here — `IMlsEngine` lives in `@pinai/domain/ports`, so
callers depend on the port and this package supplies something that satisfies
it. Today that is `wasm.adapter.ts`, the openmls WASM bundle. A React Native
build adds `native.adapter.ts` over the same Rust crate compiled natively,
because Hermes has no WebAssembly.

## Files

- **`leaf-credential.ts`** — shared by every implementation, and the reason
  this is a package rather than a file in the web app. The credential bytes
  travel: they sit in the BasicCredential of our leaf in the ratchet tree, and
  peers decode them to learn which device owns which leaf — which is how
  device revocation finds the leaf to remove. Two implementations that
  disagreed here would build groups whose members cannot identify each other.
  `apps/web/test/leaf-credential.spec.ts` pins the exact encoding.
- **`wasm.adapter.ts`** — `MlsAdapter`, the WASM `IMlsEngine`. Owns one
  `Provider` + one `Identity` + a `Map<conversation_id, Group>`. The only
  place `openmls-wasm` is imported. Every method is `async` to satisfy the
  port even though the wasm calls underneath are synchronous — see the port
  for why that was decided before the native binding exists.

## When to split this package

One package, one file per implementation, is deliberate while there is only
one implementation: `leaf-credential.ts` is shared by all of them, and they
stay pinned to one openmls version and one ciphersuite because they are
installed together.

The trigger to split is concrete — **the moment the native side needs a
non-TypeScript file of its own.** It will: a compiled Rust library per
architecture, an Expo config plugin to wire the build, probably a podspec and
a Gradle hook. That is build machinery the web app has no use for, and by
then `@pinai/web` would be installing it.

The split at that point is three packages:

- `@pinai/mls` — `leaf-credential.ts` and the conformance suite. Depends on
  `@pinai/domain` and nothing else.
- `@pinai/mls-wasm` — the current adapter plus `openmls-wasm`.
- `@pinai/mls-native` — the uniffi binding plus its native artifacts.

Doing it before then would be three packages for twenty shared lines, and the
shape of the native one is not knowable until the spike says what it ships.

A third implementation worth having eventually is a **fake** in-memory engine,
so tests above this layer need not compile a 2 MB wasm bundle. It belongs
here with the others, for the same reason the package exists — it has to
encode leaf credentials the same way. Keep it out of the E2EE specs, which
earn their keep by driving the real engine.

## Adding the native implementation

The crate is at `crypto/openmls-wasm/` (root of the repo, not inside the web
app, precisely so a second build target can consume it). It is one
`#[wasm_bindgen]`-annotated `lib.rs`; nothing JS-specific crosses its
boundary except `JsError` in the error position. Splitting it into a
binding-agnostic core plus two thin binding layers is what the native build
needs, and `apps/web/test/e2ee.spec.ts` plus
`apps/web/test/leaf-credential.spec.ts` are the conformance suite the second
implementation has to pass.
