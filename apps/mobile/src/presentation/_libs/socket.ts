import type { WsServerEvent } from "@pinai/domain/models/ws"
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
let connected = false

// The socket port takes one handler of each kind, which this module owns: it hands them on.
const eventListeners = new Set<(event: WsServerEvent) => void>()
const connectedListeners = new Set<() => void>()

/** Every event the IdP pushes, from the next one on. */
export function onSocketEvent(listener: (event: WsServerEvent) => void): () => void {
    eventListeners.add(listener)
    return () => eventListeners.delete(listener)
}

/** A connection is up now. */
export function isSocketConnected(): boolean {
    return connected
}

/** Each time a connection is up: pushes sent while it was down are lost, so a listener reads again. */
export function onSocketConnected(listener: () => void): () => void {
    connectedListeners.add(listener)
    return () => connectedListeners.delete(listener)
}

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
        connected = status === "connected"
        if (heartbeat) clearInterval(heartbeat)
        heartbeat = null
        if (status !== "connected") return
        sendHeartbeatUseCase(ws)
        heartbeat = setInterval(() => sendHeartbeatUseCase(ws), HEARTBEAT_MS)
        restatePresenceUseCase(ws, useAppStore.getState().myStatus)
        for (const listener of connectedListeners) listener()
    })
    // Its session ended (`1008`): renewed, the socket goes again with the new token.
    ws.onSessionEnded(() => {
        open = false
        void renewAccessToken().then(() => follow())
    })
    ws.onEvent((event) => {
        if (event.type === "settings_updated") receiveAccountSettings(event.data.settings)
        for (const listener of eventListeners) listener(event)
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
