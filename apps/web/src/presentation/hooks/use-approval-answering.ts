import { useEffect, useSyncExternalStore } from "react"

import type { AnsweringView, DoorSummons, SeatsView } from "@pinai/domain/models/approval-handshake"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import { AnsweringRuntime } from "@pinai/domain/usecases/e2ee/answering-runtime.usecase"
import { ApprovalAnswering, type AnswerLock } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { getApprovalRelayPort, getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { shareDeps, warnE2ee, warnOf } from "@/presentation/_libs/key-share-deps"
import { registerApprovalHandler } from "@/presentation/hooks/useIdpWebSocket"
import { useAppStore } from "@/store/store"

// For the page load: a code tried here is never tried again, whatever mounts the Door.
const usedCodes = new Set<string>()

/** Held for as long as the exchange runs, so one tab answers a request; none where the platform can't tell. */
const webLock: AnswerLock | undefined =
    typeof navigator !== "undefined" && navigator.locks
        ? (requestId) =>
              new Promise((resolve) => {
                  void navigator.locks.request(`pinai-approval:${requestId}`, { ifAvailable: true }, (lock) => {
                      if (!lock) return resolve(null)
                      return new Promise<void>((release) => resolve(() => release()))
                  })
              })
        : undefined

// The page's one answering side: the Door makes it, Settings → Devices' waiting seats answer through it.
let shared: ApprovalAnswering | null = null
const sharedListeners = new Set<() => void>()

function share(answering: ApprovalAnswering | null): void {
    shared = answering
    for (const listener of sharedListeners) listener()
}

function subscribeShared(listener: () => void): () => void {
    sharedListeners.add(listener)
    return () => sharedListeners.delete(listener)
}

/** Mounted once, by the Door: the answering side kept current (`AnsweringRuntime`), wherever an exchange started. */
export function useApprovalAnsweringRuntime(): ApprovalAnswering | null {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const socketUp = useAppStore((s) => s.wsStatus === "connected")
    const controller = useSharedApprovalAnswering()

    useEffect(() => {
        if (!signedIn || !idpUrl || !actorUri) return
        const made = new ApprovalAnswering(
            { e2ee: getE2eePort(), relay: getApprovalRelayPort(), directory: getDeviceDirectoryPort(), sharing: shareDeps() },
            { idpUrl, actorUri, accessToken: () => useAppStore.getState().accessToken, report: warnE2ee },
            { usedCodes, lock: webLock },
        )
        const runtime = new AnsweringRuntime(made, warnE2ee)
        const unregister = registerApprovalHandler((push) => void made.onPush(push).catch(warnOf(`handling ${push.type}`)))
        runtime.start(() => share(made))
        return () => {
            unregister()
            if (shared === made) share(null)
            void runtime.stop().catch(warnOf("leaving the approval prompt"))
        }
    }, [signedIn, idpUrl, actorUri])

    // A socket that was down missed pushes: the list is read again when it comes back.
    useEffect(() => {
        if (socketUp && controller) controller.refresh().catch(warnOf("reading the approval requests"))
    }, [socketUp, controller])

    return controller
}

/** The page's answering side, once the Door made it. */
export function useSharedApprovalAnswering(): ApprovalAnswering | null {
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

/** A new device's notice calls the Door for it: its code once it shows one, "Not me" at once. */
export function summonDoor(device: DoorSummons): void {
    void shared?.summon(device).catch(warnOf("reading the approval requests"))
}

/** That device came in another way, or went: the Door waits for it no more. */
export function unsummonDoor(deviceId: DeviceId): void {
    shared?.unsummon(deviceId)
}

/** What the seats read of `answering`: nothing before the Door made it. */
export function useSeats(answering: ApprovalAnswering | null): SeatsView {
    return useSyncExternalStore(answering?.subscribe ?? noSubscription, answering?.seats ?? noSeats)
}

const NO_SEATS: SeatsView = { open: [], atDoor: null, seat: null, busy: false, unsettled: false }
const noSubscription = () => () => undefined
const noView = (): AnsweringView | null => null
const noSummons = (): DoorSummons | null => null
const noSeats = (): SeatsView => NO_SEATS
