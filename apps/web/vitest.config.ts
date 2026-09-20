import path from "path"
import { defineConfig } from "vitest/config"

/**
 * Vitest config — separate from `vite.config.ts` so the dev plugins
 * (Tailwind, TanStack Router) don't run during unit tests. Mirrors the
 * `@` alias the rest of the project uses.
 *
 * `environment: "jsdom"` gives the E2EE adapters access to
 * `window.crypto`, `IndexedDB`, `WebAssembly`, and `TextEncoder` —
 * `node` lacks `IndexedDB` and the openmls-wasm bundle assumes the
 * Web Crypto subtle API is present.
 */
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        environment: "jsdom",
        // jsdom doesn't ship `IndexedDB` — `fake-indexeddb/auto` would
        // be the standard polyfill, but we don't need IndexedDB for the
        // foundation suite (the MLS + identity adapters don't touch
        // storage). When `storage.adapter.ts` tests land (alongside
        // recovery + pairing), pull in `fake-indexeddb/auto` here.
        include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
        // Node 26's experimental `localStorage` global shadows jsdom's and
        // resolves to `undefined`; this restores it. See the file for detail.
        setupFiles: ["./test/setup/web-storage.ts"],
        // openmls-wasm is a `.wasm` bundle loaded via fetch in the
        // browser. In jsdom we feed it a precompiled WebAssembly.Module
        // built from disk — the test imports the bytes via a small
        // helper so we never hit the network. See `test/e2ee.spec.ts`.
        testTimeout: 30_000,
    },
})
