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

## Adding the native implementation

The crate is at `crypto/openmls-wasm/` (root of the repo, not inside the web
app, precisely so a second build target can consume it). It is one
`#[wasm_bindgen]`-annotated `lib.rs`; nothing JS-specific crosses its
boundary except `JsError` in the error position. Splitting it into a
binding-agnostic core plus two thin binding layers is what the native build
needs, and `apps/web/test/e2ee.spec.ts` plus
`apps/web/test/leaf-credential.spec.ts` are the conformance suite the second
implementation has to pass.
