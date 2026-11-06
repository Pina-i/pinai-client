import type { BaselineIntent } from "../../models/device-trust"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface DeviceBaselineDeps {
    e2eePort: IE2eePort
    deviceDirectoryPort: IDeviceDirectoryPort
    /** Told what failed; the domain logs nothing itself. */
    report?: (what: string, error: unknown) => void
}

/** The list read and `deviceBaseline` kept as this device starts acting under `generation`; best effort. */
export async function takeDeviceBaseline(
    deps: DeviceBaselineDeps,
    idpUrl: string,
    accessToken: string,
    generation: number,
    intent: BaselineIntent | null,
): Promise<void> {
    try {
        const { devices } = await deps.deviceDirectoryPort.listDevices(idpUrl, accessToken)
        await deps.e2eePort.takeDeviceBaseline(generation, devices, intent)
    } catch (error) {
        deps.report?.("keeping the devices listed as this device started acting", error)
    }
}
