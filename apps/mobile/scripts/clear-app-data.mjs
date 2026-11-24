import { execFileSync } from "node:child_process"

// app.config.ts's android.package.
const PACKAGE = "io.github.pina_i.mobile"

function adb(...args) {
    return execFileSync("adb", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

let devices
try {
    devices = adb("devices")
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter(([, state]) => state === "device")
        .map(([id]) => id)
} catch {
    console.error("adb not found: put $ANDROID_HOME/platform-tools on your PATH (see README.md).")
    process.exit(1)
}

if (devices.length === 0) {
    console.error("No phone or emulator connected (adb devices).")
    process.exit(1)
}

for (const device of devices) {
    const installed = adb("-s", device, "shell", "pm", "list", "packages", PACKAGE)
        .split("\n")
        .some((line) => line.trim() === `package:${PACKAGE}`)
    if (!installed) {
        console.log(`${device}: the app isn't installed, nothing to clear`)
        continue
    }
    adb("-s", device, "shell", "pm", "clear", PACKAGE)
    console.log(`${device}: the app's data cleared — signed out, a new device at the next sign-in`)
}
