import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import { acceptHistoryShareUseCase, type ShareAcceptance } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { getHistoryArchivePort, getKeySharePort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { admissionDeps } from "./admission-deps"
import { restoreDueHistory } from "./history-restore"
import { warnE2ee } from "./warn-e2ee"

/**
 * The app's one call of `acceptHistoryShareUseCase`, whoever asks: one at a time, so the words are kept and approved
 * once; the restore due runs after each attempt, whatever came of it.
 */
export const acceptWaitingShare = oneAtATime(async (): Promise<ShareAcceptance | null> => {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return null
    try {
        return await acceptHistoryShareUseCase({ ...admissionDeps(), historyArchivePort: getHistoryArchivePort(), keySharePort: getKeySharePort(), report: warnE2ee })(
            idpUrl,
            accessToken,
            user.actor_uri
        )
    } finally {
        void restoreDueHistory()
    }
})
