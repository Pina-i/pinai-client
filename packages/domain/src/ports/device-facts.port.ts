import type { DeviceFacts } from "../models/device-label"

/** What a gather found; `late`, the platform didn't answer in time and asking again may tell more. */
export interface GatheredFacts<Facts extends DeviceFacts = DeviceFacts> {
    facts: Facts
    late: boolean
}

/** What this device can tell about itself, for the label it names itself by (`composeDeviceLabel`). */
export interface IDeviceFactsPort {
    /** What is known at once, nothing asked of the platform. */
    known(): DeviceFacts
    /** Every fact the platform gives within its time, those refused or late left out. Never rejects. */
    gather(): Promise<GatheredFacts>
}
