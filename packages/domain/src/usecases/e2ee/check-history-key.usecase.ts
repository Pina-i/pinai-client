import type { ActorUri } from "../../models/e2ee"
import type { HistoryKeyStanding } from "../../models/history-key"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"

import { approveByPassphraseUseCase } from "./approve-by-passphrase.usecase"
import { settlePendingHistoryKeyUseCase, type PendingKeyLock } from "./settle-pending-history-key.usecase"
import { shareOnceHeld, type ShareOnceHeldDeps } from "./share-history-key.usecase"

// A device holding the key but never settled was cut short between keeping and approving.
export function checkHistoryKeyUseCase(
    deps: ShareOnceHeldDeps & { historyArchivePort: IHistoryArchivePort; pendingKeyLock?: PendingKeyLock },
) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<HistoryKeyStanding> => {
        await settlePendingHistoryKeyUseCase(deps)(idpUrl, accessToken)
        const standing = await deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
        if (standing.kind !== "holds" || standing.settled) return standing
        const approved = await approveByPassphraseUseCase(deps)(idpUrl, accessToken, actorUri)
        if (approved.kind === "holds") await shareOnceHeld(deps, idpUrl, accessToken, actorUri)
        return approved
    }
}
