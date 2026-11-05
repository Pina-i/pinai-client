import { deviceAdmission, needsPartners, resetCause, type Admission, type PartnerFacts } from "../../models/admission"
import type { ActorUri } from "../../models/e2ee"
import type { HistoryKeyStanding } from "../../models/history-key"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface CheckAdmissionDeps {
    e2eePort: IE2eePort
    deviceDirectoryPort: IDeviceDirectoryPort
}

/**
 * One read of the key per check: the standing carries its generation, and the list is read only
 * when partners count — after a newer generation, with whether this device found its setter
 * approved.
 */
export function checkAdmissionUseCase(deps: CheckAdmissionDeps) {
    return async (
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ standing: HistoryKeyStanding; admission: Admission }> => {
        const standing = await deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
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
