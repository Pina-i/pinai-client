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

export interface KeyPackageTickDeps {
    session: { idpUrl: string; actorUri: ActorUri; accessToken: () => string | null }
    /** `replenishKeyPackagesUseCase` over the platform's ports. */
    replenish: (input: ReplenishKeyPackagesInput) => Promise<Replenished>
    /** Signing in again on `device_mismatch` is the platform's; any other failure waits for the next tick. */
    renewalFailed: (error: unknown) => void | Promise<void>
    report: (what: string, error: unknown) => void
}

/**
 * When the tick runs, for every client: at `start` — the device is in —, every `KEY_PACKAGE_REFILL_INTERVAL_MS` and
 * on `key_packages_low` (`low`), until `stop`. Without it a device's siblings can't add it once its stash is used.
 */
export class KeyPackageTick {
    private live = false
    private timer: ReturnType<typeof setInterval> | undefined
    private readonly deps: KeyPackageTickDeps

    constructor(deps: KeyPackageTickDeps) {
        this.deps = deps
    }

    start(): void {
        if (this.live) return
        this.live = true
        this.run()
        this.timer = setInterval(() => this.run(), KEY_PACKAGE_REFILL_INTERVAL_MS)
    }

    low(): void {
        if (this.live) this.run()
    }

    stop(): void {
        this.live = false
        clearInterval(this.timer)
    }

    // The token is read at each run: a renewal doesn't restart the interval.
    private run(): void {
        const { session, replenish, renewalFailed, report } = this.deps
        const accessToken = session.accessToken()
        if (!accessToken) return
        replenish({ idpUrl: session.idpUrl, accessToken, actorUri: session.actorUri })
            .then(({ renewalFailure }) => (renewalFailure === undefined ? undefined : renewalFailed(renewalFailure)))
            .catch((e: unknown) => report("topping up the KeyPackages", e))
    }
}
