import { sameHistoryKey } from "../../models/history-key"
import { isHistoryKeyConflict } from "../../models/idp-error"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"

/**
 * A pending key — minted, sealed, its `PUT` unanswered — is settled before anything else: the key
 * in force is it, so its words are kept; no key is in force, so it is set again; another key is,
 * so it is erased. From a session that named its device.
 */
export function settlePendingHistoryKeyUseCase(deps: { e2eePort: IE2eePort; historyArchivePort: IHistoryArchivePort }) {
    return async (idpUrl: string, accessToken: string): Promise<void> => {
        const pending = await deps.e2eePort.pendingHistoryKey()
        if (!pending) return
        const current = await deps.historyArchivePort.getKey(idpUrl, accessToken)
        if (current && !sameHistoryKey(current, pending)) return deps.e2eePort.dropPendingHistoryKey()
        if (!current) {
            try {
                await deps.historyArchivePort.setKey(idpUrl, accessToken, pending)
            } catch (error) {
                if (isHistoryKeyConflict(error)) return deps.e2eePort.dropPendingHistoryKey()
                throw error
            }
        }
        await deps.e2eePort.promotePendingHistoryKey()
    }
}
