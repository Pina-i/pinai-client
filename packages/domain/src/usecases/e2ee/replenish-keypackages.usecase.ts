import type { KeyPackageStatusResponse } from "../../models/e2ee"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface ReplenishKeyPackagesDeps {
    e2eePort: IE2eePort
}

export interface ReplenishKeyPackagesInput {
    idpUrl: string
    accessToken: string
}

/**
 * Polls `GET /api/keys/packages/status` and refills when the server
 * says we're below the refill threshold (or have no stash at all).
 *
 * Designed to be called from a low-frequency background timer (Phase 5
 * kicks one off every 6 h after login). Cheap when nothing's needed —
 * one HTTP round-trip and a no-op return.
 */
export const replenishKeyPackagesUseCase =
    ({ e2eePort }: ReplenishKeyPackagesDeps) =>
    async (input: ReplenishKeyPackagesInput): Promise<KeyPackageStatusResponse> => {
        return e2eePort.replenishKeyPackages(input.idpUrl, input.accessToken)
    }
