import { IdpError } from "../../models/idp-error"
import type { ActorUri } from "../../models/e2ee"
import type { GateSession } from "./onboarding-gate.usecase"

export interface ThisDeviceStartDeps {
    /** `startThisDeviceUseCase` over the platform's ports. */
    start: (
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri
    ) => Promise<{ linked: boolean; registrationFailure?: unknown; historyKeyFailure?: unknown }>
    session: () => GateSession | null
    /** Signs in afresh on `device_mismatch`; whether it was one. */
    signInAgainOnDeviceMismatch: (error: unknown) => Promise<boolean>
    warn?: (what: string, error: unknown) => void
}

/**
 * Once per load — the page's, the app's — and not before the account's storage is open: the session names
 * its device, then the device's words are checked against the history key (`startThisDeviceUseCase`).
 * Settled once linked with its words checked, or refused by the IdP (a revoked device: final);
 * `device_mismatch` signs in afresh; anything else — the IdP out of reach — is tried at the next `run`.
 */
export class ThisDeviceStart {
    private readonly deps: ThisDeviceStartDeps
    private settled = false
    private running: Promise<void> | null = null

    constructor(deps: ThisDeviceStartDeps) {
        this.deps = deps
    }

    run(): Promise<void> {
        if (this.running) return this.running
        const session = this.deps.session()
        if (this.settled || !session) return Promise.resolve()
        this.running = this.deps
            .start(session.idpUrl, session.accessToken, session.actorUri)
            .then(({ linked, registrationFailure, historyKeyFailure }) => {
                this.settled = linked && historyKeyFailure === undefined
                if (registrationFailure !== undefined) this.deps.warn?.("registering this device failed", registrationFailure)
                if (historyKeyFailure !== undefined) this.deps.warn?.("checking the history key failed", historyKeyFailure)
            })
            .catch(async (error: unknown) => {
                if (await this.deps.signInAgainOnDeviceMismatch(error)) return
                this.settled = error instanceof IdpError
            })
            .finally(() => {
                this.running = null
            })
        return this.running
    }
}
