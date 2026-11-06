import { deviceAdmission, needsPartners, resetCause, type Admission, type PartnerFacts } from "../../models/admission"
import type { ActorUri } from "../../models/e2ee"
import type { HistoryKeyStanding } from "../../models/history-key"

import { tryApproveHeldWords } from "./approve-by-passphrase.usecase"
import type { ShareOnceHeldDeps } from "./share-history-key.usecase"

export type CheckAdmissionDeps = ShareOnceHeldDeps

/**
 * One read of the key per check: the standing carries its generation, and the list is read only
 * when partners count — after a newer generation, with whether this device found its setter
 * approved. Holding the key without its own approval, the device approves itself, best effort: a
 * flow's approval cut short is made again at the next check, not the next page load.
 */
export function checkAdmissionUseCase(deps: CheckAdmissionDeps) {
    return async (
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ standing: HistoryKeyStanding; admission: Admission }> => {
        const read = await deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
        const standing = await tryApproveHeldWords(deps, idpUrl, accessToken, actorUri, read)
        let partners: PartnerFacts | null = null
        if (needsPartners(standing)) {
            const { devices } = await deps.deviceDirectoryPort.listDevices(idpUrl, accessToken)
            const checked = await deps.e2eePort.checkHandshakePartners(actorUri, devices)
            const setter = resetCause(standing) === "newer-generation" ? await deps.e2eePort.resetSetter(devices) : null
            partners = checked && { devices, ...checked, setter }
        }
        const admission = deviceAdmission(standing, partners)
        await deps.e2eePort.recordAdmission(admission)
        return { standing, admission }
    }
}
