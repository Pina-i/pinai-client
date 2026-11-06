import type { Admission } from "../../models/admission"
import type { ActorUri } from "../../models/e2ee"

import { checkAdmissionUseCase, type CheckAdmissionDeps } from "./check-admission.usecase"

export interface RegisterIdentityInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
    /** One a flow of the domain's has just decided, not to read the key again; else checked here. */
    admission?: Admission
}

/**
 * Publishes this device's KeyPackages only once it is in (`identity-provider/specs/e2ee.md § 3.6`):
 * until then nobody but the instance can add it to a conversation. Answers whether it was in.
 */
export const registerIdentityUseCase =
    (deps: CheckAdmissionDeps) =>
    async ({ idpUrl, accessToken, actorUri, admission }: RegisterIdentityInput): Promise<Admission> => {
        let known = admission
        if (known) await deps.e2eePort.recordAdmission(known)
        else known = (await checkAdmissionUseCase(deps)(idpUrl, accessToken, actorUri)).admission
        if (known.kind === "in") await deps.e2eePort.register(idpUrl, accessToken, actorUri)
        return known
    }
