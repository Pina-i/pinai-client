/**
 * Builds `crypto/openmls-wasm/` into `crypto/openmls-pkg/` when that package
 * is missing or out of date, then gets out of the way.
 *
 * `openmls-pkg/` is a generated wasm-pack artefact that self-ignores (wasm-pack
 * writes a `.gitignore` of `*` into it), so it is never committed. A fresh
 * clone therefore has a `node_modules/openmls-wasm` link pointing at a
 * directory that does not exist, and Vite only notices at dependency-scan
 * time — with a misleading "are they installed?" error. Running this from
 * `predev`/`prebuild` keeps that failure from ever reaching a developer.
 *
 * Staleness is an mtime comparison rather than an unconditional wasm-pack
 * call: cargo no-ops correctly, but the wasm-pack + wasm-bindgen round trip
 * still costs seconds on every `npm run dev`. The common case here is a few
 * filesystem stats.
 *
 * Requires `wasm-pack` on PATH (`cargo install wasm-pack`). The wasm32 target
 * is not a prerequisite — wasm-pack adds it on first run.
 *
 * Pass `--force` to rebuild regardless.
 */

import { spawnSync } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const crate = join(root, "crypto", "openmls-wasm")
const outDir = join(root, "crypto", "openmls-pkg")
const artifact = join(outDir, "openmls_wasm_bg.wasm")

/** Inputs that invalidate the build. Deliberately not the crate root — that
 *  would sweep in `target/`, whose mtime moves on every build. */
const inputs = ["src", "Cargo.toml", "Cargo.lock"].map((p) => join(crate, p))

const wasmPackArgs = [
    "build",
    "--release",
    "--target",
    "web",
    "--out-dir",
    relative(crate, outDir).split("\\").join("/"),
]

/** On Windows the executable may be a `.cmd`/`.exe` shim, which only resolves
 *  through a shell. Every argument here is a hardcoded constant, so there is
 *  nothing injectable. */
const useShell = process.platform === "win32"

function newestMtime(path) {
    const st = statSync(path, { throwIfNoEntry: false })
    if (!st) return 0
    if (!st.isDirectory()) return st.mtimeMs
    return readdirSync(path).reduce(
        (max, entry) => Math.max(max, newestMtime(join(path, entry))),
        st.mtimeMs,
    )
}

function isUpToDate() {
    const built = statSync(artifact, { throwIfNoEntry: false })
    if (!built) return false
    return inputs.every((input) => newestMtime(input) <= built.mtimeMs)
}

function hasWasmPack() {
    const probe = spawnSync("wasm-pack", ["--version"], {
        stdio: "ignore",
        shell: useShell,
    })
    return probe.status === 0
}

if (!process.argv.includes("--force") && isUpToDate()) {
    process.exit(0)
}

if (!hasWasmPack()) {
    console.error(
        [
            "",
            "[wasm] wasm-pack not found on PATH.",
            "",
            "  crypto/openmls-pkg/ is generated, not committed, and the client",
            "  cannot start without it. Install the builder once:",
            "",
            "    cargo install wasm-pack",
            "",
            "  (Requires a Rust toolchain. wasm-pack adds the wasm32-unknown-unknown",
            "  target itself on first build.)",
            "",
        ].join("\n"),
    )
    process.exit(1)
}

console.log("[wasm] building crypto/openmls-wasm -> crypto/openmls-pkg")
const result = spawnSync("wasm-pack", wasmPackArgs, {
    cwd: crate,
    stdio: "inherit",
    shell: useShell,
})

if (result.error) {
    console.error(`[wasm] build failed to start: ${result.error.message}`)
    process.exit(1)
}
process.exit(result.status ?? 1)
