import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { POLL_BACKOFF_MS, codeDigits, isWholeCode, pollDelay, type HandshakeFailure } from "@pinai/domain/models/approval-handshake"
import { formatLastSeen } from "@pinai/domain/models/relative-time"
import {
    ApprovalAnswering,
    type AnswerLock,
    type AnsweringView,
} from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { revokeDeviceUseCase } from "@pinai/domain/usecases/e2ee/revoke-device.usecase"
import { getApprovalRelayPort, getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { devicesQueryKey } from "@/presentation/hooks/useDevices"
import { registerApprovalHandler } from "@/presentation/hooks/useIdpWebSocket"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

/** What a failed exchange tells the user; nothing was approved in any of them. */
export function failureWording(reason: HandshakeFailure, device: string): string {
    switch (reason) {
        case "wrong-code":
            return `That code didn't match. A wrong code ends the request: ${device} shows a new one.`
        case "tampered":
            return "Something changed the messages between your devices. Nothing was approved."
        case "keys-refused":
            return `${device}'s keys aren't the ones your instance lists for it. Nothing was approved.`
        case "not-acting":
            return "This device can't approve others right now: it doesn't hold your account's current history passphrase."
        case "ended":
        case "expired":
            return "The request ended before it was done. Nothing was approved."
        default:
            return `This didn't finish. Nothing was approved — ask again from ${device}.`
    }
}

export function refusalWording(refused: AnsweringView["refused"]): string | null {
    if (refused === "used-code") return "That code was tried already — type the new one it shows."
    if (refused === "other-tab") return "Another tab is answering this request."
    return null
}

/** The dialog's name, as its stage reads. */
export function doorTitle(view: AnsweringView | null): string {
    if (view?.stage === "approved") return "Approved"
    if (view?.stage === "working") return "Approving"
    if (view?.stage === "failed") return "Not approved"
    return "Is this you?"
}

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

function warn(what: string) {
    return (error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(`[e2ee] ${what}`, error instanceof Error ? error.message : error)
    }
}

export interface ApprovalDoorViewModel {
    view: AnsweringView | null
    /** The device asking, by name. */
    device: string
    /** "signed in 2 minutes ago · kauai.studio" */
    signedIn: string
    title: string
    code: string
    setCode: (text: string) => void
    canApprove: boolean
    error: string | null
    onApprove: () => void
    onCancel: () => void
    isSigningOut: boolean
    onNotMe: () => void
    onClose: () => void
    /** Signing it out takes a recent password. */
    recentSignIn: RecentSignIn
}

function returnHere(): string {
    return `${window.location.pathname}${window.location.search}`
}

export function useApprovalDoorViewModel(): ApprovalDoorViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const socketUp = useAppStore((s) => s.wsStatus === "connected")
    const queryClient = useQueryClient()
    const recentSignIn = useRecentSignIn(returnHere)
    const { refused } = recentSignIn

    const [controller, setController] = useState<ApprovalAnswering | null>(null)
    const view = useSyncExternalStore(controller?.subscribe ?? noSubscription, controller?.snapshot ?? noView)
    const requestId = view?.request.id ?? null
    // Typed for one request: a new request starts empty.
    const [typed, setTyped] = useState<{ requestId: string | null; code: string; error: string | null }>({
        requestId: null,
        code: "",
        error: null,
    })
    const code = typed.requestId === requestId ? typed.code : ""
    const error = typed.requestId === requestId ? typed.error : null
    const [isSigningOut, setIsSigningOut] = useState(false)
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (!signedIn || !idpUrl || !actorUri) return
        const made = new ApprovalAnswering(
            { e2ee: getE2eePort(), relay: getApprovalRelayPort(), directory: getDeviceDirectoryPort() },
            { idpUrl, actorUri, accessToken: () => useAppStore.getState().accessToken, report: (what, e) => warn(what)(e) },
            { usedCodes, lock: webLock },
        )
        let live = true
        let retry: ReturnType<typeof setTimeout> | undefined
        const unregister = registerApprovalHandler((push) => void made.onPush(push).catch(warn(`handling ${push.type}`)))
        const refresh = (failures: number) => {
            made.refresh().then(
                () => {
                    if (live) setController(made)
                },
                (e: unknown) => {
                    warn("reading the approval requests")(e)
                    if (!live) return
                    setController(made)
                    retry = setTimeout(() => refresh(failures + 1), POLL_BACKOFF_MS[Math.min(failures + 1, POLL_BACKOFF_MS.length - 1)])
                },
            )
        }
        refresh(0)
        return () => {
            live = false
            clearTimeout(retry)
            unregister()
            setController(null)
            void made.dismiss().catch(warn("leaving the approval prompt"))
        }
    }, [signedIn, idpUrl, actorUri])

    // A socket that was down missed pushes: the list is read again when it comes back.
    useEffect(() => {
        if (socketUp && controller) controller.refresh().catch(warn("reading the approval requests"))
    }, [socketUp, controller])

    const working = view?.stage === "working"
    useEffect(() => {
        if (!working || !controller) return
        let live = true
        let timer: ReturnType<typeof setTimeout> | undefined
        const next = (failures: number, lastError: unknown) => {
            timer = setTimeout(() => {
                controller.poll().then(
                    () => {
                        if (live) next(0, null)
                    },
                    (e: unknown) => {
                        warn("reading the exchange")(e)
                        if (live) next(failures + 1, e)
                    },
                )
            }, pollDelay(failures, lastError))
        }
        next(0, null)
        return () => {
            live = false
            clearTimeout(timer)
        }
    }, [working, controller])

    useEffect(() => {
        if (!requestId) return
        const timer = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(timer)
    }, [requestId])

    const { data: devices } = useQuery({
        queryKey: devicesQueryKey(idpUrl ?? ""),
        queryFn: async () => (await getDeviceDirectoryPort().listDevices(idpUrl!, useAppStore.getState().accessToken!)).devices,
        enabled: !!idpUrl && signedIn && requestId !== null,
    })

    const asking = view ? devices?.find((d) => d.device_id === view.request.deviceId) : undefined
    const since = formatLastSeen(asking?.paired_at ?? view?.request.createdAt ?? "", new Date(now))
    const host = idpUrl ? new URL(idpUrl).host : ""

    const onApprove = useCallback(() => {
        if (!controller || !isWholeCode(code)) return
        setTyped({ requestId, code, error: null })
        controller.answer(code).catch((e: unknown) => {
            warn("answering the request")(e)
            setTyped({ requestId, code, error: "Couldn't reach your instance. Try again." })
        })
    }, [controller, code, requestId])

    const onNotMe = useCallback(async () => {
        const token = useAppStore.getState().accessToken
        if (!view || !idpUrl || !token || !actorUri || !controller) return
        setIsSigningOut(true)
        try {
            await revokeDeviceUseCase({ e2eePort: getE2eePort(), deviceDirectoryPort: getDeviceDirectoryPort() })({
                idpUrl,
                accessToken: token,
                actorUri,
                deviceId: view.request.deviceId,
                conversationIds: localDmConvos.map((c) => c.id),
            })
            await controller.dismiss()
            await queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
            toast.success(`${view.request.displayName || "That device"} is signed out`)
        } catch (e) {
            if (refused(e, "sign that device out")) return
            toast.error(e instanceof Error ? e.message : "Couldn't sign it out")
        } finally {
            setIsSigningOut(false)
        }
    }, [view, idpUrl, actorUri, controller, localDmConvos, queryClient, refused])

    return {
        view,
        device: view?.request.displayName || "A new device",
        signedIn: `signed in ${since ?? "just now"}${host ? ` · ${host}` : ""}`,
        title: doorTitle(view),
        code,
        setCode: (text: string) => setTyped({ requestId, code: codeDigits(text), error: null }),
        canApprove: view?.stage === "entry" && isWholeCode(code),
        error: error ?? refusalWording(view?.refused ?? null),
        onApprove,
        onCancel: () => void controller?.cancel().catch(warn("cancelling the exchange")),
        isSigningOut,
        onNotMe: () => void onNotMe(),
        onClose: () => void controller?.dismiss().catch(warn("closing the approval prompt")),
        recentSignIn,
    }
}

const noSubscription = () => () => undefined
const noView = () => null
