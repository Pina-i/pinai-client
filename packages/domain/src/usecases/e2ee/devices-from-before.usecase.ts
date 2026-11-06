import type { BeforeCause } from "../../models/device-trust"
import { fromBeforeDevices } from "../../models/device-roster"
import type { ActorUri } from "../../models/e2ee"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface DevicesFromBefore {
    cause: BeforeCause
    labels: string[]
}

/**
 * The devices the new words being shown left behind, as Settings → Devices seats them
 * (`fromBeforeDevices`): the list read and reviewed, so both name the same devices. `null` for words
 * of no generation of this device's own, or none left behind.
 */
export function devicesFromBeforeUseCase(deps: { e2eePort: IE2eePort; deviceDirectoryPort: IDeviceDirectoryPort }) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<DevicesFromBefore | null> => {
        const shown = await deps.e2eePort.newWordsToShow()
        if (!shown) return null
        const { devices } = await deps.deviceDirectoryPort.listDevices(idpUrl, accessToken)
        const verdict = await deps.e2eePort.reviewDevices(idpUrl, accessToken, actorUri, devices)
        if (!verdict.acting || verdict.generation !== shown.generation || !verdict.before) return null
        const left = fromBeforeDevices({ devices, events: deps.e2eePort.trustSnapshot(), verdict })
        if (left.length === 0) return null
        return { cause: verdict.before.cause, labels: left.map((d) => d.display_name.trim() || "a device") }
    }
}
