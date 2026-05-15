import type { ActorUri } from "@/domain/models/e2ee"
import type { IE2eePort } from "@/domain/ports/e2ee.port"

export interface RegisterDeviceDeps {
    e2eePort: IE2eePort
}
export interface RegisterDeviceInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
}

/** Idempotent device-attestation flow. */
export const registerDeviceUseCase =
    ({ e2eePort }: RegisterDeviceDeps) =>
    (input: RegisterDeviceInput): Promise<void> =>
        e2eePort.registerDevice(input.idpUrl, input.accessToken, input.actorUri)
