import type { Admission } from "../../models/admission"
import type { ActorUri, KeyPackageStatusResponse } from "../../models/e2ee"

import { checkAdmissionUseCase, type CheckAdmissionDeps } from "./check-admission.usecase"

/** How often an open session checks its stash, beside entering the app and `key_packages_low`. */
export const KEY_PACKAGE_REFILL_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface ReplenishKeyPackagesInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
}

export interface Replenished {
    admission: Admission
    /** The stash after the top-up; `null` for a device out, which publishes nothing. */
    status: KeyPackageStatusResponse | null
    renewalFailure?: unknown
}

/**
 * The KeyPackage tick: renews the attestation when it is due (`identity-provider/specs/e2ee.md
 * § 6.7`), then — only while the device is in — tops the stash up when the server says it is at
 * the refill threshold or doesn't list it, so a first batch not yet out goes too. A device that
 * turned out stops refilling. A renewal that fails holds no refill up: it is tried again at the
 * next tick, and answered as `renewalFailure`.
 */
export const replenishKeyPackagesUseCase =
    (deps: CheckAdmissionDeps) =>
    async (input: ReplenishKeyPackagesInput): Promise<Replenished> => {
        let renewalFailure: unknown
        try {
            await deps.e2eePort.registerDevice(input.idpUrl, input.accessToken, input.actorUri)
        } catch (error) {
            renewalFailure = error
        }
        const { admission } = await checkAdmissionUseCase(deps)(input.idpUrl, input.accessToken, input.actorUri)
        const status =
            admission.kind === "in"
                ? await deps.e2eePort.replenishKeyPackages(input.idpUrl, input.accessToken, input.actorUri)
                : null
        return renewalFailure === undefined ? { admission, status } : { admission, status, renewalFailure }
    }
