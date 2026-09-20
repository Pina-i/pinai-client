import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Compile the openmls WASM bundle the app itself would load.
 *
 * Resolved through `node_modules/openmls-wasm` rather than a path into
 * `crypto/`: that is the same entry the bundler resolves, so the specs cannot
 * drift onto a different build, and it does not care where the crate sits
 * relative to the app — which it no longer does, now that the app is a
 * workspace member and `crypto/` lives at the root.
 *
 * `process.cwd()` rather than `import.meta.url`, because the latter is
 * virtualised under jsdom and `fileURLToPath` rejects it.
 */
export function loadWasmModule(): Promise<WebAssembly.Module> {
    const path = resolve(process.cwd(), "node_modules/openmls-wasm/openmls_wasm_bg.wasm")
    return WebAssembly.compile(readFileSync(path))
}
