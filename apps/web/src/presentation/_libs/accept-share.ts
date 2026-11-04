import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import { acceptHistoryShareUseCase, type ShareAcceptance } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { restoreDueHistory } from "@/presentation/_libs/history-restore"
import { acceptShareDeps } from "@/presentation/_libs/key-share-deps"
import { useAppStore } from "@/store/store"

/**
 * The page's one call of `acceptHistoryShareUseCase`, whoever asks — the restore page, the asking
 * section, the app: one at a time, so the words are kept and approved once; the restore due runs
 * after each attempt, whatever came of it.
 */
export const acceptWaitingShare = oneAtATime(async (): Promise<ShareAcceptance | null> => {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return null
    try {
        return await acceptHistoryShareUseCase(acceptShareDeps())(idpUrl, accessToken, user.actor_uri)
    } finally {
        void restoreDueHistory()
    }
})
