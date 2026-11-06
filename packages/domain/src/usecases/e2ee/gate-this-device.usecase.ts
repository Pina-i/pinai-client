import { decideGateRoute, keptWordsReset, type GateRoute, type KeptWordsReset } from "../../models/admission"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { ActorUri } from "../../models/e2ee"
import { isUnreachable } from "../../models/idp-error"

import { checkAdmissionUseCase, type CheckAdmissionDeps } from "./check-admission.usecase"

/** Where the gate sends this device; in by its kept words, why (`reset`); `offline` when decided on what was recorded. */
export interface GateDecision {
    route: GateRoute
    reset: KeptWordsReset | null
    offline: boolean
}

/**
 * Where the onboarding gate sends this device (`decideGateRoute`). A pending key goes to setup
 * unchecked: settling it comes before any check. An IdP out of reach decides on what was last
 * recorded, so a device let in before — by its words, a partner or the words it kept — reloads
 * offline; any other failure, or nothing recorded, is thrown.
 */
export function gateDecisionUseCase(deps: CheckAdmissionDeps) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<GateDecision> => {
        const pending = await pendingKeyRoute(deps.e2eePort)
        if (pending) return { route: pending, reset: null, offline: false }
        try {
            const { standing, admission } = await checkAdmissionUseCase(deps)(idpUrl, accessToken, actorUri)
            return { route: decideGateRoute({ pending: false, standing, admission }), reset: keptWordsReset(admission, standing), offline: false }
        } catch (error) {
            if (!isUnreachable(error)) throw error
            const [standing, admission] = await Promise.all([
                deps.e2eePort.historyKeyStanding(),
                deps.e2eePort.recordedAdmission(),
            ])
            if (!admission) throw error
            return { route: decideGateRoute({ pending: false, standing, admission }), reset: keptWordsReset(admission, standing), offline: true }
        }
    }
}

/** `gateDecisionUseCase`'s route alone, for a page that only goes where the gate says. */
export function gateThisDeviceUseCase(deps: CheckAdmissionDeps) {
    const decide = gateDecisionUseCase(deps)
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<GateRoute> =>
        (await decide(idpUrl, accessToken, actorUri)).route
}

/** The gate's first rule, read alone by a page outside the gate: a pending key goes to setup; `null` when none waits. */
export async function pendingKeyRoute(e2eePort: Pick<IE2eePort, "pendingHistoryKey">): Promise<GateRoute | null> {
    return (await e2eePort.pendingHistoryKey()) ? decideGateRoute({ pending: true }) : null
}
