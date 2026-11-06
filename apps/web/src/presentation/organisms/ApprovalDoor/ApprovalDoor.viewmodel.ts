import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { codeDigits, isWholeCode, type AnsweringView } from "@pinai/domain/models/approval-handshake"
import { revokeDeviceUseCase } from "@pinai/domain/usecases/e2ee/revoke-device.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { refusalWording } from "@/presentation/_libs/approval-wording"
import { devicesQueryKey } from "@/presentation/hooks/useDevices"
import { warnOf as warn } from "@/presentation/_libs/key-share-deps"
import { useApprovalAnsweringRuntime, useDoorView } from "@/presentation/hooks/use-approval-answering"
import { useAskedLine } from "@/presentation/hooks/use-asked-line"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

/** The dialog's name, as its stage reads. */
export function doorTitle(view: AnsweringView | null): string {
    if (view?.stage === "approved") return "Approved"
    if (view?.stage === "working") return "Approving"
    if (view?.stage === "failed") return "Not approved"
    return "Is this you?"
}

export interface ApprovalDoorViewModel {
    view: AnsweringView | null
    /** The device asking, by name. */
    device: string
    /** "asked 2 minutes ago · kauai.studio" */
    asked: string
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
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const queryClient = useQueryClient()
    const recentSignIn = useRecentSignIn(returnHere)
    const { refused } = recentSignIn

    const controller = useApprovalAnsweringRuntime()
    const view = useDoorView(controller)
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
    const asked = useAskedLine(view?.request.createdAt ?? null)

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
        device: view?.request.displayName.trim() || "A device",
        asked,
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

