/**
 * Plays the encrypted store's contract on a connected device, then checks the store across the app being killed:
 * starts the app again on Metro (`--metro <url>`, `http://localhost:8081` by default — the address `pnpm android:mobile`
 * forwards), opens `io.github.pina-i://dev/storage-check`, then `dev/storage-restart?phase=write`, kills and starts the
 * app again, opens `dev/storage-restart?phase=read`. Development builds only. `--serial <id>` picks a device.
 */

import { connect, option } from "./device-check.mjs"

const device = connect("storage-check")
const metro = option("metro") ?? "http://localhost:8081"

console.log(`[storage-check] starting the app on ${metro}…`)
await device.relaunch(metro)
device.open("dev/storage-check")
console.log(`[storage-check] playing the contract on ${device.serial}…`)
const [, passed, total] = await device.waitFor(/\[storage-check\] (\d+)\/(\d+) passed/, 300, "no result within 300 s")

device.open("dev/storage-restart?phase=write")
const [, written] = await device.waitFor(/\[storage-check\] restart: (.*)/, 120, "nothing written within 120 s")
if (written !== "written") process.exit(1)

console.log("[storage-check] killing the app, starting it again…")
await device.relaunch(metro)
device.open("dev/storage-restart?phase=read")
const [, read] = await device.waitFor(/\[storage-check\] restart: (.*)/, 120, "nothing read back within 120 s")

process.exit(passed === total && read === "all back" ? 0 : 1)
