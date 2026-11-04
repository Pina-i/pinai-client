import { decideGateRoute, type GateRoute } from "../../models/admission"
import type { ActorUri } from "../../models/e2ee"
import { isUnreachable } from "../../models/idp-error"

import { checkAdmissionUseCase, type CheckAdmissionDeps } from "./check-admission.usecase"

/**
 * Where the onboarding gate sends this device (`decideGateRoute`). A pending key goes to setup
 * unchecked: settling it comes before any check. An IdP out of reach decides on what was last
 * recorded, so a device let in before — by its words or a partner — reloads offline; any other
 * failure, or nothing recorded, is thrown.
 */
export function gateThisDeviceUseCase(deps: CheckAdmissionDeps) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<GateRoute> => {
        if (await deps.e2eePort.pendingHistoryKey()) return decideGateRoute({ pending: true })
        try {
            const { standing, admission } = await checkAdmissionUseCase(deps)(idpUrl, accessToken, actorUri)
            return decideGateRoute({ pending: false, standing, admission })
        } catch (error) {
            if (!isUnreachable(error)) throw error
            const [standing, admission] = await Promise.all([
                deps.e2eePort.historyKeyStanding(),
                deps.e2eePort.recordedAdmission(),
            ])
            if (!admission) throw error
            return decideGateRoute({ pending: false, standing, admission })
        }
    }
}
