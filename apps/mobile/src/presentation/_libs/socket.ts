import { restatePresenceUseCase } from "@pinai/domain/usecases/presence/restate-presence.usecase"
import { sendHeartbeatUseCase } from "@pinai/domain/usecases/presence/send-heartbeat.usecase"
import { AppState } from "react-native"
import { getWsPort } from "@/ioc"
import { receiveAccountSettings } from "@/presentation/_libs/appearance"
import { renewAccessToken } from "@/presentation/_libs/session"
import { useAppStore } from "@/store/store"

// The IdP reads a connection silent for 10 minutes as away: 30 s keeps it well inside.
const HEARTBEAT_MS = 30_000

let started = false
let open = false

/**
 * The IdP's socket, open while someone is signed in and the app is in front: in the background
 * it closes, and friends see the phone offline once it isn't used. Idempotent.
 */
export function keepSocketOpen(): void {
    if (started) return
    started = true
    const ws = getWsPort()
    let heartbeat: ReturnType<typeof setInterval> | null = null

    ws.onStatusChange((status) => {
        if (heartbeat) clearInterval(heartbeat)
        heartbeat = null
        if (status !== "connected") return
        sendHeartbeatUseCase(ws)
        heartbeat = setInterval(() => sendHeartbeatUseCase(ws), HEARTBEAT_MS)
        restatePresenceUseCase(ws, useAppStore.getState().myStatus)
    })
    // Its session ended (`1008`): renewed, the socket goes again with the new token.
    ws.onSessionEnded(() => {
        open = false
        void renewAccessToken().then(() => follow())
    })
    ws.onEvent((event) => {
        if (event.type === "settings_updated") receiveAccountSettings(event.data.settings)
    })

    AppState.addEventListener("change", follow)
    useAppStore.subscribe((state, previous) => {
        if ((state.accessToken === null) !== (previous.accessToken === null)) follow()
    })
    follow()
}

function follow(): void {
    const { idpUrl, accessToken } = useAppStore.getState()
    const wanted = idpUrl !== null && accessToken !== null && AppState.currentState === "active"
    if (wanted === open) return
    open = wanted
    const ws = getWsPort()
    if (wanted) ws.connect(idpUrl!, () => useAppStore.getState().accessToken)
    else ws.disconnect()
}
