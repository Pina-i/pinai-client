import { startAnswering } from "./approval-answering"
import { watchArrivals } from "./arrivals"
import { keepDevicesInStep } from "./device-review"
import { keepShareTaken } from "./history-share"
import { keepMessaging } from "./messaging"
import { keepPushRegistered } from "./push-notices"
import { watchStartOverPrompts } from "./start-over-prompt"

/** What runs once this device is in, until it no longer is or the account signs out. */
export function startAppRuntime(): () => void {
    // The answering side first: an arrival the first review announces summons the Door through it.
    const stops = [
        startAnswering(),
        watchArrivals(),
        keepShareTaken(),
        keepDevicesInStep(),
        keepMessaging(),
        watchStartOverPrompts(),
        keepPushRegistered(),
    ]
    return () => stops.forEach((stop) => stop())
}
