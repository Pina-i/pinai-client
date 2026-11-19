import type { DeviceLabel } from "@pinai/domain/models/device-label"
import type { ThisDeviceLabel } from "@pinai/domain/usecases/e2ee/this-device-label.usecase"

/** `getThisDeviceLabel` for an `@/ioc` mock: one label, known at once. */
export function fixedDeviceLabel(name = "Web client"): ThisDeviceLabel {
    const label: DeviceLabel = { name, kind: "unknown", client: "browser" }
    return { now: () => label, settled: async () => label }
}
