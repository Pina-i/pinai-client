import { execFileSync } from "node:child_process"

// Metro, then the local instance the app signs in to: Alice's by default, `pnpm reverse 8090` for another.
const instancePort = process.argv[2] ?? "8088"
if (!/^\d{1,5}$/.test(instancePort)) {
    console.error(`Not a port: ${instancePort}`)
    process.exit(1)
}
const ports = ["8081", instancePort]

function adb(...args) {
    return execFileSync("adb", args, { encoding: "utf8" })
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

// Every device at once: a bare `adb reverse` refuses to choose when a phone and an emulator are both there.
for (const device of devices) {
    for (const port of ports) adb("-s", device, "reverse", `tcp:${port}`, `tcp:${port}`)
    console.log(`${device}: localhost:${ports.join(" and localhost:")} reach this computer`)
}
