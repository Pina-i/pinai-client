import type { ActorUri } from "../../models/e2ee"
import type { HistoryKeyStanding } from "../../models/history-key"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"

import { approveHeldWords } from "./approve-by-passphrase.usecase"
import { settlePendingHistoryKeyUseCase, type PendingKeyLock } from "./settle-pending-history-key.usecase"
import type { ShareOnceHeldDeps } from "./share-history-key.usecase"

export function checkHistoryKeyUseCase(
    deps: ShareOnceHeldDeps & { historyArchivePort: IHistoryArchivePort; pendingKeyLock?: PendingKeyLock },
) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<HistoryKeyStanding> => {
        await settlePendingHistoryKeyUseCase(deps)(idpUrl, accessToken)
        const standing = await deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
        return approveHeldWords(deps, idpUrl, accessToken, actorUri, standing)
    }
}
