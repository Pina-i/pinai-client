import type { ActorUri, KeyPackageStatusResponse } from "../../models/e2ee"
import type { IE2eePort } from "../../ports/e2ee.port"

/** How often an open session checks its stash, beside entering the app and `key_packages_low`. */
export const KEY_PACKAGE_REFILL_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface ReplenishKeyPackagesDeps {
    e2eePort: IE2eePort
}

export interface ReplenishKeyPackagesInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
}

/**
 * The KeyPackage tick: renews the attestation when it is due (`identity-provider/specs/e2ee.md
 * § 6.7`), then tops the stash up when the server says it is at the refill threshold or holds
 * none. A renewal that fails holds no refill up: it is tried again at the next tick, and answered
 * as `renewalFailure`.
 *
 * Cheap when nothing's needed — one HTTP round-trip and a no-op return.
 */
export const replenishKeyPackagesUseCase =
    ({ e2eePort }: ReplenishKeyPackagesDeps) =>
    async (input: ReplenishKeyPackagesInput): Promise<{ status: KeyPackageStatusResponse; renewalFailure?: unknown }> => {
        let renewalFailure: unknown
        try {
            await e2eePort.registerDevice(input.idpUrl, input.accessToken, input.actorUri)
        } catch (error) {
            renewalFailure = error
        }
        const status = await e2eePort.replenishKeyPackages(input.idpUrl, input.accessToken, input.actorUri)
        return renewalFailure === undefined ? { status } : { status, renewalFailure }
    }
