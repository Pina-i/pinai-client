import type { ActorUri } from "../../models/e2ee"
import type { HistoryKeyStanding } from "../../models/history-key"
import { isStaleHistoryKey } from "../../models/idp-error"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"

/**
 * A device that comes to hold the current passphrase approves itself with it, then reports the
 * generation (`identity-provider/specs/e2ee.md § 3.9`, § 6.4), from a session that named it. A
 * generation set meanwhile (`stale_history_key`) reads the key again: the standing answers.
 */
export function approveByPassphraseUseCase(deps: { e2eePort: IE2eePort; deviceDirectoryPort: IDeviceDirectoryPort }) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<HistoryKeyStanding> => {
        const approval = await deps.e2eePort.signPassphraseApproval(idpUrl, accessToken, actorUri)
        const { deviceId, generation } = approval
        try {
            await deps.deviceDirectoryPort.approveByPassphrase(idpUrl, accessToken, deviceId, generation, approval.signature)
            await deps.deviceDirectoryPort.reportHistoryKey(idpUrl, accessToken, deviceId, generation)
        } catch (error) {
            if (isStaleHistoryKey(error)) return deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
            throw error
        }
        await deps.e2eePort.recordPassphraseApproval(generation, approval.rootKey)
        return { kind: "holds", generation, settled: true }
    }
}
