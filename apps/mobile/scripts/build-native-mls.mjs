/**
 * Builds the MLS engine for the app, into each platform's `modules/openmls/<platform>/generated/`, which git ignores.
 * Rebuilds only when the Rust sources, the manifests or the lock are newer than the output; `--force` rebuilds.
 *
 * - Android (the default): `crypto/openmls-native` with cargo-ndk, one library per ABI, and its Kotlin bindings.
 *   Chained before `expo run:android`.
 * - `ios`: a static library per target, the simulators' merged, the Swift bindings and `OpenMlsNative.xcframework`.
 *   The libraries and the bindings build anywhere; the xcframework takes macOS (`lipo`, `xcodebuild`), so elsewhere
 *   the script stops there: a check that the Rust builds for iOS. Chained before `expo run:ios`.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const app = join(dirname(fileURLToPath(import.meta.url)), "..")
const crypto = join(app, "..", "..", "crypto")
const platform = process.argv.includes("ios") ? "ios" : "android"
const generated = join(app, "modules", "openmls", platform, "generated")
const jniLibs = join(generated, "jniLibs")
const kotlin = join(generated, "kotlin")
const swift = join(generated, "swift")
const headers = join(generated, "headers")
const xcframework = join(generated, "OpenMlsNative.xcframework")

/** Phones, and the emulator on an x86_64 computer. */
const ABIS = { "arm64-v8a": "aarch64-linux-android", x86_64: "x86_64-linux-android" }
/** The app's minimum Android API. */
const ANDROID_API = "24"
const ANDROID_LIBRARY = "libopenmls_native.so"
/** The iPhone, then the simulator on Apple silicon and on Intel Macs. */
const IOS_DEVICE = "aarch64-apple-ios"
const IOS_SIMULATORS = ["aarch64-apple-ios-sim", "x86_64-apple-ios"]
const IOS_LIBRARY = "libopenmls_native.a"
const canPackageIos = process.platform === "darwin"
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
const iosLibrary = (target) => join(crypto, "target", target, "ios", IOS_LIBRARY)
const outputs =
    platform === "android"
        ? [...Object.keys(ABIS).map((abi) => join(jniLibs, abi, ANDROID_LIBRARY)), join(kotlin, "uniffi", "openmls_native", "openmls_native.kt")]
        : [
              join(swift, "openmls_native.swift"),
              ...(canPackageIos ? [join(xcframework, "Info.plist")] : [IOS_DEVICE, ...IOS_SIMULATORS].map(iosLibrary)),
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

function needTargets(targets, platformName) {
    const missing = targets.filter((target) => !installed.includes(target))
    if (missing.length > 0) {
        fail([`[native-mls] Rust can't build for ${platformName} yet. Run once:`, "", `    rustup target add ${missing.join(" ")}`])
    }
}

/** uniffi reads the bindings off the host build of the same source, so they match every target's checksums. */
function bindings(language, outDir) {
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
            language,
            "--out-dir",
            outDir,
            "--no-format",
        ],
        { cwd: crypto },
    )
}

function buildAndroid() {
    needTargets(Object.values(ABIS), "Android")
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
    bindings("kotlin", kotlin)
}

function buildIos() {
    const targets = [IOS_DEVICE, ...IOS_SIMULATORS]
    needTargets(targets, "iOS")
    console.log(`[native-mls] building crypto/openmls-native for ${targets.join(", ")}`)
    // A static library: nothing is linked here, so no Apple linker is needed — and Android's cdylib stays as it is.
    for (const target of targets) {
        run(
            "cargo",
            ["rustc", "-p", "openmls-native", "--lib", "--crate-type", "staticlib", "--profile", "ios", "--target", target, "--locked"],
            { cwd: crypto },
        )
    }
    console.log("[native-mls] generating its Swift bindings")
    rmSync(swift, { recursive: true, force: true })
    bindings("swift", swift)
    // The C side goes in the xcframework's headers, named as Clang looks for a module.
    rmSync(headers, { recursive: true, force: true })
    mkdirSync(headers, { recursive: true })
    renameSync(join(swift, "openmls_nativeFFI.h"), join(headers, "openmls_nativeFFI.h"))
    renameSync(join(swift, "openmls_nativeFFI.modulemap"), join(headers, "module.modulemap"))

    if (!canPackageIos) {
        console.log(
            [
                "[native-mls] the iOS libraries and the Swift bindings are built.",
                "  OpenMlsNative.xcframework takes macOS (lipo, xcodebuild): run this on a Mac to package them.",
            ].join("\n"),
        )
        return
    }
    const simulators = join(crypto, "target", "ios-simulator", IOS_LIBRARY)
    mkdirSync(dirname(simulators), { recursive: true })
    run("lipo", ["-create", ...IOS_SIMULATORS.map(iosLibrary), "-output", simulators])
    rmSync(xcframework, { recursive: true, force: true })
    run("xcodebuild", [
        "-create-xcframework",
        "-library",
        iosLibrary(IOS_DEVICE),
        "-headers",
        headers,
        "-library",
        simulators,
        "-headers",
        headers,
        "-output",
        xcframework,
    ])
}

if (platform === "ios") buildIos()
else buildAndroid()
