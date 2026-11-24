import * as Device from "expo-device"
import type { MobileOs, PhoneFacts } from "@pinai/domain/models/device-label"
import type { GatheredFacts, IDeviceFactsPort } from "@pinai/domain/ports/device-facts.port"

// Android's `osName` may be a build fingerprint: only iOS and iPadOS are named for sure.
function osOf(name: string | null): MobileOs {
    return name === "iOS" || name === "iPadOS" ? name : "Android"
}

/** What the phone tells of itself, all known at once: `expo-device` reads it as the app starts. */
export class ExpoDeviceFactsAdapter implements IDeviceFactsPort {
    known(): PhoneFacts {
        return {
            client: "phone-app",
            os: osOf(Device.osName),
            kind: Device.deviceType === Device.DeviceType.TABLET ? "tablet" : "phone",
            model: Device.modelName,
            deviceName: Device.deviceName,
        }
    }

    async gather(): Promise<GatheredFacts> {
        return { facts: this.known(), late: false }
    }
}
