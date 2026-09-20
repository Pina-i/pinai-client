import type { ActorUri, DeviceId, Fingerprint } from "@/domain/models/e2ee"
import type { IE2eePort } from "@/domain/ports/e2ee.port"

export interface RegisterIdentityDeps {
    e2eePort: IE2eePort
}

export interface RegisterIdentityInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
}

/**
 * One-time setup at first login on a fresh device.
 *
 * The use case is idempotent: if the device already has a stored
 * MSK / SSK / USK bundle the port returns its existing fingerprint
 * and refills the KeyPackage stash if the IdP says so.
 *
 * UI is wired in Phase 6's onboarding flow ("Generate identity",
 * "Pair with another device", "Restore from Recovery Key"); this
 * use case is the first option.
 */
export const registerIdentityUseCase =
    ({ e2eePort }: RegisterIdentityDeps) =>
    async (
        input: RegisterIdentityInput,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint }> => {
        return e2eePort.register(input.idpUrl, input.accessToken, input.actorUri)
    }
