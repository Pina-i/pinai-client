import { mayTurnOnSecondFactor } from "../../models/admission"
import type { IE2eePort } from "../../ports/e2ee.port"

/** Whether this device may turn the second factor on (`mayTurnOnSecondFactor`), on what its last check recorded. */
export function mayTurnOnSecondFactorUseCase(e2eePort: Pick<IE2eePort, "historyKeyStanding" | "recordedAdmission">) {
    return async (): Promise<boolean> => {
        const [standing, admission] = await Promise.all([e2eePort.historyKeyStanding(), e2eePort.recordedAdmission()])
        return mayTurnOnSecondFactor(standing, admission)
    }
}
