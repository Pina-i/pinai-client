import { approveHeldWordsUseCase } from "@pinai/domain/usecases/e2ee/approve-by-passphrase.usecase"
import { getE2eePort, getKeySharePort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { acceptWaitingShare } from "./accept-share"
import { admissionDeps } from "./admission-deps"
import { isSocketConnected, onSocketConnected, onSocketEvent } from "./socket"
import { warnE2ee } from "./warn-e2ee"

const failed = (error: unknown) => warnE2ee("reading the history key share", error)

// Kept words need no share; the phone keeps no messages, so it has no restore to run either.
async function takeWhileLacking(): Promise<void> {
    if ((await getE2eePort().historyKeyStanding()).kind === "holds") return
    await acceptWaitingShare()
}

// A dropped network is the likely reason a flow's own approval by the words didn't go.
async function approveIfUnsettled(): Promise<void> {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return
    await approveHeldWordsUseCase({ ...admissionDeps(), keySharePort: getKeySharePort() })(idpUrl, accessToken, user.actor_uri)
}

/**
 * A device let in by its partner takes its key share in the app too (`identity-provider/specs/e2ee.md § 3.11`):
 * at once, on `history_key_ready` (read whatever the standing says: it may name a generation not met yet), and
 * when the socket comes back, its own approval by its words made again first.
 */
export function keepShareTaken(): () => void {
    void takeWhileLacking().catch(failed)
    // A connection up as it starts counts as the first: the read at start follows it.
    let connects = isSocketConnected() ? 1 : 0
    const stops = [
        onSocketEvent((event) => {
            if (event.type === "history_key_ready") void acceptWaitingShare().catch(failed)
        }),
        onSocketConnected(() => {
            if (connects++ === 0) return
            approveIfUnsettled().catch((error: unknown) => warnE2ee("approving this device by its words", error))
            void takeWhileLacking().catch(failed)
        }),
    ]
    return () => stops.forEach((stop) => stop())
}
