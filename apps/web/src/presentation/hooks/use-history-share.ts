import { useEffect, useRef } from "react"

import { approveHeldWordsUseCase } from "@pinai/domain/usecases/e2ee/approve-by-passphrase.usecase"
import { getE2eePort } from "@/ioc"
import { acceptWaitingShare } from "@/presentation/_libs/accept-share"
import { restoreDueHistory, showRestoreInApp } from "@/presentation/_libs/history-restore"
import { acceptShareDeps, warnE2ee } from "@/presentation/_libs/key-share-deps"
import { registerHistoryKeyReadyHandler } from "@/presentation/hooks/useIdpWebSocket"
import { useAppStore } from "@/store/store"

const failed = (error: unknown) => warnE2ee("reading the history key share", error)

// A push is read whatever the standing says: it may announce a generation this device hasn't met.
async function readWhileLacking(): Promise<void> {
    if ((await getE2eePort().historyKeyStanding()).kind === "holds") {
        await restoreDueHistory()
        return
    }
    await acceptWaitingShare()
}

// A dropped network is the likely reason a flow's own approval by the words didn't go.
function approveIfUnsettled(): Promise<unknown> {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return Promise.resolve()
    return approveHeldWordsUseCase(acceptShareDeps())(idpUrl, accessToken, user.actor_uri)
}

/** A device let in by its partner takes its key share in the app (`identity-provider/specs/e2ee.md § 3.11`). */
export function useHistoryShare(): void {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const socketUp = useAppStore((s) => s.wsStatus === "connected")
    const connects = useRef(0)

    useEffect(() => showRestoreInApp(), [])

    useEffect(() => {
        if (!signedIn || !idpUrl || !actorUri) return
        void readWhileLacking().catch(failed)
        return registerHistoryKeyReadyHandler(() => void acceptWaitingShare().catch(failed))
    }, [signedIn, idpUrl, actorUri])

    // The first connect follows the read at startup; a later one may have missed a push.
    useEffect(() => {
        if (!socketUp || !idpUrl || !actorUri) return
        if (connects.current++ === 0) return
        void approveIfUnsettled().catch((error: unknown) => warnE2ee("approving this device by its words", error))
        void readWhileLacking().catch(failed)
    }, [socketUp, idpUrl, actorUri])
}
