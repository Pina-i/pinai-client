/**
 * Builds `crypto/openmls-wasm/` into `crypto/openmls-pkg/` when that package
 * is missing or out of date, then makes sure the installed copy in
 * `node_modules/` matches.
 *
 * `openmls-pkg/` is a generated wasm-pack artefact that self-ignores (wasm-pack
 * writes a `.gitignore` of `*` into it), so it is never committed. A fresh
 * clone therefore has nothing behind the `openmls-wasm` dependency, and Vite
 * only notices at dependency-scan time — with a misleading "are they
 * installed?" error. Building from the `dev`/`build` scripts keeps that
 * failure from ever reaching a developer.
 *
 * Staleness is an mtime comparison rather than an unconditional wasm-pack
 * call: cargo no-ops correctly, but the wasm-pack + wasm-bindgen round trip
 * still costs seconds on every `dev`. The common case here is a few
 * filesystem stats.
 *
 * Requires `wasm-pack` on PATH (`cargo install wasm-pack`). The wasm32 target
 * is not a prerequisite — wasm-pack adds it on first run.
 *
 * Pass `--force` to rebuild regardless.
 */

import { spawnSync } from "node:child_process"
import { cpSync, lstatSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const crate = join(root, "crypto", "openmls-wasm")
const outDir = join(root, "crypto", "openmls-pkg")
const artifact = join(outDir, "openmls_wasm_bg.wasm")
/**
 * Where a consumer's install of the package may sit. pnpm links it into the
 * workspace member that depends on it; npm and bun may hoist it to the root
 * instead. Both are checked so the staleness guard keeps working whichever
 * package manager produced the tree.
 */
const installCandidates = [
    join(root, "packages", "mls", "node_modules", "openmls-wasm"),
    join(root, "apps", "web", "node_modules", "openmls-wasm"),
    join(root, "node_modules", "openmls-wasm"),
]

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

function packageIsCurrent() {
    const built = statSync(artifact, { throwIfNoEntry: false })
    if (!built) return false
    return inputs.every((input) => newestMtime(input) <= built.mtimeMs)
}

/**
 * A dependency that resolves to the built package itself tracks it for free.
 * A copy does not: rebuilding `openmls-pkg/` allocates new inodes, orphaning
 * whatever `node_modules` holds. Vite resolves the bare `openmls-wasm` import
 * through `node_modules`, so the app would go on loading stale MLS code with
 * nothing reported anywhere — the worst failure mode available here.
 *
 * Package managers differ: pnpm's `link:` points straight at the directory,
 * its `file:` copies into the store *behind* a symlink, npm symlinks, and bun
 * hardlink-copies. So the test is what the path resolves to, not whether it
 * happens to be a symlink.
 */
function installedIsCurrent() {
    const installed = installCandidates.find((p) => lstatSync(p, { throwIfNoEntry: false }))
    if (!installed) return true // not installed yet; the next install will pick it up
    if (realpathSync(installed) === realpathSync(outDir)) return true

    const source = statSync(artifact, { throwIfNoEntry: false })
    const copy = statSync(join(installed, "openmls_wasm_bg.wasm"), {
        throwIfNoEntry: false,
    })
    if (!source || !copy) return false
    // Timestamps survive the copy only to whole-second precision on some
    // filesystems (DrvFs truncates), so compare with a tolerance rather than
    // for equality — otherwise every run would re-copy 2.2 MB.
    return (
        source.size === copy.size &&
        Math.abs(source.mtimeMs - copy.mtimeMs) <= 2000
    )
}

function refreshInstalled() {
    const found = installCandidates.find((p) => lstatSync(p, { throwIfNoEntry: false }))
    if (!found) return
    // Refresh whatever the entry really points at, not the link itself.
    const installed = realpathSync(found)
    if (installed === realpathSync(outDir)) return

    rmSync(installed, { recursive: true, force: true })
    // preserveTimestamps keeps the mtime comparison above meaningful.
    cpSync(outDir, installed, { recursive: true, preserveTimestamps: true })
    console.log(`[wasm] refreshed ${relative(root, installed)} (copied install)`)
}

function hasWasmPack() {
    const probe = spawnSync("wasm-pack", ["--version"], {
        stdio: "ignore",
        shell: useShell,
    })
    return probe.status === 0
}

const force = process.argv.includes("--force")

if (!force && packageIsCurrent()) {
    // Source is untouched, but the installed copy can still be stale — a
    // previous build may have replaced the package out from under it.
    if (!installedIsCurrent()) refreshInstalled()
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
if (result.status !== 0) process.exit(result.status)

refreshInstalled()
