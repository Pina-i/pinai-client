/**
 * Plays the MLS contract on a connected device: opens the development build's control screen
 * (`io.github.pina-i://dev/mls-check`) and waits for its result line in the device's log. The app
 * must be running as a development build, with Metro serving it. `--serial <id>` picks a device.
 */

import { spawn, spawnSync } from "node:child_process"

const APP = "io.github.pina_i.mobile"
const LINK = "io.github.pina-i://dev/mls-check"
const TIMEOUT_MS = 180_000
const NO_ADB = "[mls-check] adb not found: put $ANDROID_HOME/platform-tools on your PATH (see README.md)."

function fail(lines) {
    console.error(["", ...lines, ""].join("\n"))
    process.exit(1)
}

function pickDevice() {
    const at = process.argv.indexOf("--serial")
    if (at >= 0 && process.argv[at + 1]) return process.argv[at + 1]
    const listed = spawnSync("adb", ["devices"], { encoding: "utf8" })
    if (listed.error) fail([NO_ADB])
    const devices = listed.stdout
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter(([, state]) => state === "device")
        .map(([id]) => id)
    if (devices.length === 1) return devices[0]
    const found = devices.length === 0 ? "No device connected" : `${devices.length} devices connected`
    fail([`[mls-check] ${found}: pass --serial <id> (adb devices).`])
}

const serial = pickDevice()
const adb = (...args) => ["-s", serial, ...args]

spawnSync("adb", adb("logcat", "-c"))
const opened = spawnSync("adb", adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", LINK, APP), {
    encoding: "utf8",
})
// `--serial` skips `adb devices`, so this is where a missing adb shows then.
if (opened.error) fail([NO_ADB])
const said = `${opened.stdout}${opened.stderr}`
if (opened.status !== 0 || /Error/.test(said)) fail([`[mls-check] couldn't open ${LINK} on ${serial}:`, said])
console.log(`[mls-check] playing the contract on ${serial}…`)

const log = spawn("adb", adb("logcat", "-v", "raw", "-s", "ReactNativeJS:V"))
const timer = setTimeout(() => {
    log.kill()
    fail([`[mls-check] no result within ${TIMEOUT_MS / 1000} s: is the development build open, with Metro serving it?`])
}, TIMEOUT_MS)

let pending = ""
log.stdout.setEncoding("utf8")
log.stdout.on("data", (chunk) => {
    pending += chunk
    const lines = pending.split("\n")
    pending = lines.pop() ?? ""
    for (const line of lines) {
        if (!line.includes("[mls-check]")) continue
        console.log(line.trim())
        const summary = line.match(/\[mls-check\] (\d+)\/(\d+) passed/)
        if (summary) {
            clearTimeout(timer)
            log.kill()
            process.exit(summary[1] === summary[2] ? 0 : 1)
        }
    }
})
