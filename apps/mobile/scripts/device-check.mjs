/**
 * What the device checks (`mls:check`, `storage:check`) share: one phone or emulator through adb, the app's links,
 * its JavaScript log, and starting it again on Metro's bundle. `--serial <id>` picks a device.
 */

import { spawn, spawnSync } from "node:child_process"

const APP = "io.github.pina_i.mobile"
const SCHEME = "io.github.pina-i"
const NO_ADB = "adb not found: put $ANDROID_HOME/platform-tools on your PATH (see README.md)."

export function fail(label, ...lines) {
    console.error(["", `[${label}] ${lines[0]}`, ...lines.slice(1), ""].join("\n"))
    process.exit(1)
}

/** `--name value` on the command line. */
export function option(name) {
    const at = process.argv.indexOf(`--${name}`)
    return at >= 0 ? process.argv[at + 1] : undefined
}

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function onlyDevice(label) {
    const listed = spawnSync("adb", ["devices"], { encoding: "utf8" })
    if (listed.error) fail(label, NO_ADB)
    const devices = listed.stdout
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter(([, state]) => state === "device")
        .map(([id]) => id)
    if (devices.length === 1) return devices[0]
    const found = devices.length === 0 ? "No device connected" : `${devices.length} devices connected`
    fail(label, `${found}: pass --serial <id> (adb devices).`)
}

export function connect(label) {
    const serial = option("serial") ?? onlyDevice(label)

    function adb(...args) {
        const done = spawnSync("adb", ["-s", serial, ...args], { encoding: "utf8" })
        // `--serial` skips `adb devices`, so this is where a missing adb shows then.
        if (done.error) fail(label, NO_ADB)
        return done
    }

    const device = {
        serial,

        /** Opens `<scheme>://<path>` in the app, its log cleared first: what is read after is this link's. */
        open(path) {
            adb("logcat", "-c")
            const link = `${SCHEME}://${path}`
            // adb joins its arguments into one unescaped line for the device's shell: `?`, `&` and `'` aren't its.
            const quoted = `'${link.replaceAll("'", "'\\''")}'`
            const opened = adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", quoted, APP)
            const said = `${opened.stdout}${opened.stderr}`
            if (opened.status !== 0 || /Error/.test(said)) fail(label, `couldn't open ${link} on ${serial}:`, said)
        },

        /** Prints the app's `[label]` lines until one matches `pattern`; its match. */
        waitFor(pattern, seconds, timedOut) {
            return new Promise((resolve) => {
                const log = spawn("adb", ["-s", serial, "logcat", "-v", "raw", "-s", "ReactNativeJS:V"])
                const timer = setTimeout(() => {
                    log.kill()
                    fail(label, timedOut)
                }, seconds * 1000)
                let pending = ""
                log.stdout.setEncoding("utf8")
                log.stdout.on("data", (chunk) => {
                    pending += chunk
                    const lines = pending.split("\n")
                    pending = lines.pop() ?? ""
                    for (const line of lines) {
                        if (line.includes(`[${label}]`)) console.log(line.trim())
                        const found = line.match(pattern)
                        if (found) {
                            clearTimeout(timer)
                            log.kill()
                            resolve(found)
                            return
                        }
                    }
                })
            })
        },

        /** Kills the app and starts it again on `metro`'s bundle; answers once it runs and its router listens. */
        async relaunch(metro) {
            adb("shell", "am", "force-stop", APP)
            device.open(`expo-development-client/?url=${encodeURIComponent(metro)}`)
            await device.waitFor(/Running "main"/, 180, `the app didn't start on ${metro}: is Metro serving it there?`)
            // A link sent before the router listens would be lost.
            await pause(4000)
        },
    }
    return device
}
