import type { AnsweringView, DoorSummons, SeatsView } from "@pinai/domain/models/approval-handshake"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import { AnsweringRuntime } from "@pinai/domain/usecases/e2ee/answering-runtime.usecase"
import { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { useSyncExternalStore } from "react"
import { getApprovalRelayPort, getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { appVisibility } from "./app-visibility"
import { shareDeps } from "./share-deps"
import { onSocketConnected, onSocketEvent } from "./socket"
import { warnE2ee } from "./warn-e2ee"

// For the app run: a code tried here is never tried again.
const usedCodes = new Set<string>()

// The app's one answering side: the Door and Settings › Devices' seats answer through it.
let shared: ApprovalAnswering | null = null
// Running before it is shared: an arrival the first review announces may come before the first read settles.
let running: ApprovalAnswering | null = null
const listeners = new Set<() => void>()

function share(answering: ApprovalAnswering | null): void {
    if (shared === answering) return
    shared = answering
    for (const listener of listeners) listener()
}

/**
 * Another device's approval requests, read and answered while the app is in (`identity-provider/specs/e2ee.md
 * § 3.10`): pushed by the socket, read again when it comes back and when the app comes back to the front — the
 * socket closes in the background —, the rest of the timing `AnsweringRuntime`'s. One process: no lock.
 */
export function startAnswering(): () => void {
    const { idpUrl, user } = useAppStore.getState()
    if (!idpUrl || !user) return () => undefined
    const made = new ApprovalAnswering(
        { e2ee: getE2eePort(), relay: getApprovalRelayPort(), directory: getDeviceDirectoryPort(), sharing: shareDeps() },
        { idpUrl, actorUri: user.actor_uri, accessToken: () => useAppStore.getState().accessToken, report: warnE2ee },
        { usedCodes }
    )
    const runtime = new AnsweringRuntime(made, warnE2ee)
    running = made
    const stops = [
        onSocketEvent((event) => {
            if (event.type === "approval_requested" || event.type === "approval_message" || event.type === "approval_closed") {
                made.onPush(event).catch((error: unknown) => warnE2ee(`handling ${event.type}`, error))
            }
        }),
        onSocketConnected(() => runtime.reconnected()),
        appVisibility.onChange(() => {
            if (appVisibility.visible()) runtime.reconnected()
        }),
    ]
    runtime.start(() => share(made))
    return () => {
        stops.forEach((stop) => stop())
        if (running === made) running = null
        if (shared === made) share(null)
        runtime.stop().catch((error: unknown) => warnE2ee("leaving the approval prompt", error))
    }
}

function subscribeShared(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

/** The app's answering side, once its first read settled. */
export function useAnswering(): ApprovalAnswering | null {
    return useSyncExternalStore(subscribeShared, () => shared)
}

/** What the Door shows of `answering`. */
export function useDoorView(answering: ApprovalAnswering | null): AnsweringView | null {
    return useSyncExternalStore(answering?.subscribe ?? noSubscription, answering?.snapshot ?? noView)
}

/** The device the Door was called for while it shows no code yet. */
export function useDoorSummons(answering: ApprovalAnswering | null): DoorSummons | null {
    return useSyncExternalStore(answering?.subscribe ?? noSubscription, answering?.summons ?? noSummons)
}

/** What the seats read of `answering`: nothing before its first read. */
export function useSeats(answering: ApprovalAnswering | null): SeatsView {
    return useSyncExternalStore(answering?.subscribe ?? noSubscription, answering?.seats ?? noSeats)
}

/** A device arrived: the Door opens for it, its code once it shows one, "Not me" at once. */
export function summonDoor(device: DoorSummons): void {
    running?.summon(device).catch((error: unknown) => warnE2ee("reading the approval requests", error))
}

/** That device came in another way, or went: the Door waits for it no more. */
export function unsummonDoor(deviceId: DeviceId): void {
    running?.unsummon(deviceId)
}

const NO_SEATS: SeatsView = { open: [], atDoor: null, seat: null, busy: false, unsettled: false }
const noSubscription = () => () => undefined
const noView = (): AnsweringView | null => null
const noSummons = (): DoorSummons | null => null
const noSeats = (): SeatsView => NO_SEATS
