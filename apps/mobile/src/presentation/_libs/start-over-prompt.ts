import { promptShown } from "@pinai/domain/models/start-over"
import { startOverToPromptUseCase, type StartOverPrompt } from "@pinai/domain/usecases/e2ee/start-over-request.usecase"
import { useSyncExternalStore } from "react"
import { getE2eePort, getStartOverPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { appVisibility } from "./app-visibility"
import { onSocketConnected, onSocketEvent } from "./socket"
import { warnE2ee } from "./warn-e2ee"

let read: StartOverPrompt | null = null
let shown: StartOverPrompt | null = null
// "Not now" lasts the app run: a new push for that request brings it back.
const putOff = new Set<string>()
const listeners = new Set<() => void>()

function settle(next: StartOverPrompt | null): void {
    read = next
    const visible = next && promptShown(next.request, putOff) ? next : null
    if (visible === shown) return
    shown = visible
    for (const listener of listeners) listener()
}

/** Another device's open request, as the IdP shows it: only to the devices approved under its generation. */
export async function readStartOverPrompt(): Promise<void> {
    const { idpUrl, accessToken } = useAppStore.getState()
    if (!idpUrl || !accessToken) return
    settle(await startOverToPromptUseCase({ e2eePort: getE2eePort(), startOverPort: getStartOverPort() })(idpUrl, accessToken))
}

function reread(): void {
    readStartOverPrompt().catch((error: unknown) => warnE2ee("reading another device's start over request", error))
}

/**
 * Read at once, on `start_over_requested`, and when the socket or the app comes back — pushes reach live sessions
 * only, and the socket closes in the background. A missed warning is the costly failure.
 */
export function watchStartOverPrompts(): () => void {
    reread()
    const stops = [
        onSocketEvent((event) => {
            if (event.type === "start_over_requested") {
                putOff.delete(event.data.request_id)
                reread()
            } else if (event.type === "start_over_cancelled" && read?.request.id === event.data.request_id) {
                settle(null)
            }
        }),
        onSocketConnected(reread),
        appVisibility.onChange(() => {
            if (appVisibility.visible()) reread()
        }),
    ]
    return () => {
        stops.forEach((stop) => stop())
        settle(null)
    }
}

/** "Not now", "Done", or gone already: not shown again this run unless pushed again. */
export function putOffPrompt(requestId: string): void {
    putOff.add(requestId)
    settle(read)
}

export function useStartOverPrompt(): StartOverPrompt | null {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        () => shown
    )
}
