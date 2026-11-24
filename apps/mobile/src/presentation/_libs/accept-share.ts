import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import { acceptHistoryShareUseCase, type ShareAcceptance } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { getHistoryArchivePort, getKeySharePort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { admissionDeps } from "./admission-deps"
import { warnE2ee } from "./warn-e2ee"

/** The app's one call of `acceptHistoryShareUseCase`, whoever asks: one at a time, so the words are kept and approved once. */
export const acceptWaitingShare = oneAtATime(async (): Promise<ShareAcceptance | null> => {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return null
    return acceptHistoryShareUseCase({ ...admissionDeps(), historyArchivePort: getHistoryArchivePort(), keySharePort: getKeySharePort(), report: warnE2ee })(
        idpUrl,
        accessToken,
        user.actor_uri
    )
})
