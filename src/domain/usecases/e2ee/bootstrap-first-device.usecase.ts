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
 * Phase 6a — first-device onboarding orchestration.
 *
 * Thin wrapper around `IE2eePort.bootstrapFirstDevice`. The actual
 * orchestration (register + generate mnemonic + setupRecoveryKey +
 * saveStoredPassphrase) lives on the adapter so it can be deduplicated
 * via a single `bootstrapPromise` against concurrent callers — under
 * React StrictMode's double-effect-fire two viewmodel mounts would
 * otherwise each generate a different mnemonic, race the local-save
 * and server-upload steps, and leave local + server out of sync.
 */
export const bootstrapFirstDeviceUseCase =
    ({ e2eePort }: BootstrapFirstDeviceDeps) =>
    (input: BootstrapFirstDeviceInput): Promise<BootstrapFirstDeviceResult> =>
        e2eePort.bootstrapFirstDevice(input.idpUrl, input.accessToken, input.actorUri)
