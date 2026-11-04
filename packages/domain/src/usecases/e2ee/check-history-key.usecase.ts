import type { ActorUri } from "../../models/e2ee"
import type { HistoryKeyStanding } from "../../models/history-key"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"

import { approveByPassphraseUseCase } from "./approve-by-passphrase.usecase"
import { settlePendingHistoryKeyUseCase } from "./settle-pending-history-key.usecase"

// A device holding the key but never settled was cut short between keeping and approving.
export function checkHistoryKeyUseCase(deps: {
    e2eePort: IE2eePort
    historyArchivePort: IHistoryArchivePort
    deviceDirectoryPort: IDeviceDirectoryPort
}) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<HistoryKeyStanding> => {
        await settlePendingHistoryKeyUseCase(deps)(idpUrl, accessToken)
        const standing = await deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
        if (standing.kind !== "holds" || standing.settled) return standing
        return approveByPassphraseUseCase(deps)(idpUrl, accessToken, actorUri)
    }
}
