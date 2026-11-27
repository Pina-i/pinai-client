/**
 * Plays the MLS contract on a connected device: opens the development build's control screen
 * (`io.github.pina-i://dev/mls-check`) and waits for its result line in the device's log. The app
 * must be running as a development build, with Metro serving it. `--serial <id>` picks a device.
 */

import { connect } from "./device-check.mjs"

const device = connect("mls-check")
device.open("dev/mls-check")
console.log(`[mls-check] playing the contract on ${device.serial}…`)
const [, passed, total] = await device.waitFor(
    /\[mls-check\] (\d+)\/(\d+) passed/,
    180,
    "no result within 180 s: is the development build open, with Metro serving it?"
)
process.exit(passed === total ? 0 : 1)
