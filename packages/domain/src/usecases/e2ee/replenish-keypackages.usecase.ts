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
 * Polls `GET /api/keys/packages/status` and refills when the server
 * says we're below the refill threshold (or have no stash at all).
 *
 * Cheap when nothing's needed — one HTTP round-trip and a no-op return.
 */
export const replenishKeyPackagesUseCase =
    ({ e2eePort }: ReplenishKeyPackagesDeps) =>
    async (input: ReplenishKeyPackagesInput): Promise<KeyPackageStatusResponse> => {
        return e2eePort.replenishKeyPackages(input.idpUrl, input.accessToken, input.actorUri)
    }
