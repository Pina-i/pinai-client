/**
 * Builds the MLS engine for the Android app: `crypto/openmls-native` with cargo-ndk, one library
 * per ABI, and its Kotlin bindings with uniffi — into `modules/openmls/android/generated/`, which
 * git ignores. Rebuilds only when the Rust sources, the manifests or the lock are newer than the
 * output; `--force` rebuilds. Chained before `expo run:android`.
 */

import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const app = join(dirname(fileURLToPath(import.meta.url)), "..")
const crypto = join(app, "..", "..", "crypto")
const generated = join(app, "modules", "openmls", "android", "generated")
const jniLibs = join(generated, "jniLibs")
const kotlin = join(generated, "kotlin")

/** Phones, and the emulator on an x86_64 computer. */
const ABIS = { "arm64-v8a": "aarch64-linux-android", x86_64: "x86_64-linux-android" }
/** The app's minimum Android API. */
const ANDROID_API = "24"
const ANDROID_LIBRARY = "libopenmls_native.so"
/** The host build the bindings are read from: the same source, so the same checksums. */
const HOST_LIBRARY = { darwin: "libopenmls_native.dylib", win32: "openmls_native.dll" }[process.platform] ?? "libopenmls_native.so"

const inputs = [
    "openmls-core/src",
    "openmls-core/Cargo.toml",
    "openmls-native/src",
    "openmls-native/Cargo.toml",
    "Cargo.toml",
    "Cargo.lock",
    ".cargo/config.toml",
].map((p) => join(crypto, p))
const outputs = [
    ...Object.keys(ABIS).map((abi) => join(jniLibs, abi, ANDROID_LIBRARY)),
    join(kotlin, "uniffi", "openmls_native", "openmls_native.kt"),
]

function newestMtime(path) {
    const st = statSync(path, { throwIfNoEntry: false })
    if (!st) return 0
    if (!st.isDirectory()) return st.mtimeMs
    return readdirSync(path).reduce((max, entry) => Math.max(max, newestMtime(join(path, entry))), st.mtimeMs)
}

function isCurrent() {
    if (!outputs.every((p) => existsSync(p))) return false
    const built = Math.min(...outputs.map((p) => statSync(p).mtimeMs))
    return inputs.every((input) => newestMtime(input) <= built)
}

function fail(lines) {
    console.error(["", ...lines, ""].join("\n"))
    process.exit(1)
}

function run(command, args, options) {
    const result = spawnSync(command, args, { stdio: "inherit", ...options })
    if (result.error) fail([`[native-mls] ${command} failed to start: ${result.error.message}`])
    if (result.status !== 0) process.exit(result.status ?? 1)
}

function succeeds(command, args) {
    return spawnSync(command, args, { stdio: "ignore" }).status === 0
}

if (!process.argv.includes("--force") && isCurrent()) process.exit(0)

if (!succeeds("cargo", ["--version"])) fail(["[native-mls] cargo not found: install Rust (https://rustup.rs)."])
const installed = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" }).stdout ?? ""
const missing = Object.values(ABIS).filter((target) => !installed.includes(target))
if (missing.length > 0) {
    fail(["[native-mls] Rust can't build for Android yet. Run once:", "", `    rustup target add ${missing.join(" ")}`])
}
if (!succeeds("cargo", ["ndk", "--version"])) {
    fail(["[native-mls] cargo-ndk not found. Install it once:", "", "    cargo install cargo-ndk --locked"])
}
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), "Android", "Sdk")
const ndk = join(sdk, "ndk")
if (!process.env.ANDROID_NDK_HOME && !(existsSync(ndk) && readdirSync(ndk).length > 0)) {
    fail([
        `[native-mls] No Android NDK under ${ndk}.`,
        "  Install one from Android Studio (SDK Manager → SDK Tools → NDK), or set ANDROID_NDK_HOME.",
    ])
}

console.log(`[native-mls] building crypto/openmls-native for ${Object.keys(ABIS).join(", ")}`)
run(
    "cargo",
    [
        "ndk",
        ...Object.keys(ABIS).flatMap((abi) => ["-t", abi]),
        "--platform",
        ANDROID_API,
        "-o",
        jniLibs,
        "build",
        "--profile",
        "android",
        "-p",
        "openmls-native",
        "--locked",
    ],
    { cwd: crypto, env: { ...process.env, ANDROID_HOME: sdk } },
)
console.log("[native-mls] generating its Kotlin bindings")
run("cargo", ["build", "-p", "openmls-native", "--locked"], { cwd: crypto })
run(
    "cargo",
    [
        "run",
        "-p",
        "uniffi-bindgen",
        "--locked",
        "--",
        "generate",
        "--library",
        join(crypto, "target", "debug", HOST_LIBRARY),
        "--language",
        "kotlin",
        "--out-dir",
        kotlin,
        "--no-format",
    ],
    { cwd: crypto },
)
