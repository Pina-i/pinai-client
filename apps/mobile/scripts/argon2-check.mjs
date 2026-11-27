/**
 * Plays Argon2id's known answers on the native library of a connected device: opens the development
 * build's control screen (`io.github.pina-i://dev/argon2-check`) and waits for its result line in the
 * device's log, each case's time printed. The app must be running as a development build, with Metro
 * serving it. `--serial <id>` picks a device.
 */

import { connect } from "./device-check.mjs"

const device = connect("argon2-check")
device.open("dev/argon2-check")
console.log(`[argon2-check] playing the known answers on ${device.serial}…`)
const [, passed, total] = await device.waitFor(
    /\[argon2-check\] (\d+)\/(\d+) passed/,
    180,
    "no result within 180 s: is the development build open, with Metro serving it?"
)
process.exit(passed === total ? 0 : 1)
