import type { ActorUri, DeviceId, Fingerprint } from "@/domain/models/e2ee"
import type { IE2eePort } from "@/domain/ports/e2ee.port"

export interface BootstrapFirstDeviceDeps {
    e2eePort: IE2eePort
}

export interface BootstrapFirstDeviceInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
}

export interface BootstrapFirstDeviceResult {
    device_id: DeviceId
    fingerprint: Fingerprint
    words: string[]
}

/**
 * First-device onboarding orchestration. Thin wrapper — the adapter
 * dedupes concurrent callers so StrictMode double-mounts don't mint
 * two mnemonics.
 */
export const bootstrapFirstDeviceUseCase =
    ({ e2eePort }: BootstrapFirstDeviceDeps) =>
    (input: BootstrapFirstDeviceInput): Promise<BootstrapFirstDeviceResult> =>
        e2eePort.bootstrapFirstDevice(input.idpUrl, input.accessToken, input.actorUri)
