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

/**
 * Phase 7 — idempotent device-attestation flow. Generates the DRK on
 * first call, mints the IdP attestation, persists locally. Subsequent
 * calls reuse the stored DRK and renew the attestation when within 30
 * days of expiry; otherwise short-circuit.
 *
 * Called by the onboarding gate after `useIdentityOnboardingGate`
 * admits a fresh device, and by the silent-renewal scheduler.
 */
export const registerDeviceUseCase =
    ({ e2eePort }: RegisterDeviceDeps) =>
    (input: RegisterDeviceInput): Promise<void> =>
        e2eePort.registerDevice(input.idpUrl, input.accessToken, input.actorUri)
