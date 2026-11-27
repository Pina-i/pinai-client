import { doorCanApprove, doorState } from "@pinai/domain/models/approval-door"
import { failureWording, refusalWording, UNREACHABLE_LINE } from "@pinai/domain/models/approval-wording"
import { isApprovalRequired, isUnreachable } from "@pinai/domain/models/idp-error"
import { instanceHost } from "@pinai/domain/models/instance"
import { passwordAdvice } from "@pinai/domain/models/instance-admin"
import { ONLY_APPROVED_REVOKES } from "@pinai/domain/models/device-roster"
import { askedLine } from "@pinai/domain/models/relative-time"
import { usePathname } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { getDeviceDirectoryPort } from "@/ioc"
import { useAnswering, useDoorSummons, useDoorView } from "@/presentation/_libs/approval-answering"
import { signOutDevice } from "@/presentation/_libs/sign-out-device"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useClock } from "@/presentation/hooks/use-clock"
import { usePasswordChange } from "@/presentation/hooks/use-password-change"
import { useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

/**
 * `ask`: a code to type, or the device summoned and waited for; `working`: the exchange under way; `approved` and
 * `failed`: how it went; `signed-out`: "Not me" went through.
 */
export type DoorStage = "ask" | "working" | "approved" | "failed" | "signed-out"

export function useApprovalDoorViewModel() {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const pathname = usePathname()
    const recentSignIn = useRecentSignIn(() => pathname)
    const { refused } = recentSignIn

    const answering = useAnswering()
    const view = useDoorView(answering)
    const summons = useDoorSummons(answering)
    const door = useMemo(() => doorState(view, summons), [view, summons])
    const requestId = view?.request.id ?? null

    // Typed for one request: a new request starts empty.
    const [typed, setTyped] = useState<{ requestId: string | null; code: string; error: string | null }>({ requestId: null, code: "", error: null })
    const code = typed.requestId === requestId ? typed.code : ""
    const typedError = typed.requestId === requestId ? typed.error : null

    // Kept past the request: what to do about the password, once the device is signed out.
    const [signedOut, setSignedOut] = useState<string | null>(null)
    const [signingOut, setSigningOut] = useState(false)
    const [signOutError, setSignOutError] = useState<string | null>(null)
    const [adviceShown, setAdviceShown] = useState(false)
    const howToChange = usePasswordChange(signedOut !== null)

    // A summoned device shows no request yet: its row says since when it is signed in.
    const [pairedAt, setPairedAt] = useState<{ deviceId: string; at: string } | null>(null)
    const summonedId = view ? null : (summons?.deviceId ?? null)
    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!summonedId || !idpUrl || !accessToken) return
        let live = true
        getDeviceDirectoryPort()
            .listDevices(idpUrl, accessToken)
            .then(({ devices }) => {
                const at = devices.find((d) => d.device_id === summonedId)?.paired_at
                if (live && at) setPairedAt({ deviceId: summonedId, at })
            })
            .catch((error: unknown) => warnE2ee("reading the device list", error))
        return () => {
            live = false
        }
    }, [summonedId, idpUrl])

    const now = useClock(door.isOpen)
    const since = view
        ? askedLine(view.request.createdAt, now, "")
        : pairedAt && pairedAt.deviceId === summonedId
          ? askedLine(pairedAt.at, now, "", "signed in")
          : null

    const stage: DoorStage =
        signedOut !== null
            ? "signed-out"
            : view?.stage === "working"
              ? "working"
              : view?.stage === "approved"
                ? "approved"
                : view?.stage === "failed"
                  ? "failed"
                  : "ask"

    const setCode = (next: string) => setTyped({ requestId, code: next.slice(0, 6), error: null })

    const onApprove = () => {
        if (!answering || !doorCanApprove(view, code)) return
        setTyped({ requestId, code, error: null })
        answering.answer(code).catch((error: unknown) => {
            warnE2ee("answering the request", error)
            setTyped({ requestId, code, error: UNREACHABLE_LINE })
        })
    }

    const onNotMe = () => {
        const target = door.target
        if (!target || signingOut) return
        setSigningOut(true)
        setSignOutError(null)
        signOutDevice(target.deviceId)
            .then(async () => {
                setSignedOut(door.device)
                await answering?.dismiss()
            })
            .catch((error: unknown) => {
                if (refused(error, "sign that device out")) return
                warnE2ee("signing the device out", error)
                setSignOutError(
                    isApprovalRequired(error) ? `${ONLY_APPROVED_REVOKES}.` : isUnreachable(error) ? UNREACHABLE_LINE : "Couldn't sign it out. Try again."
                )
            })
            .finally(() => setSigningOut(false))
    }

    const close = () => {
        answering?.dismiss().catch((error: unknown) => warnE2ee("closing the approval prompt", error))
    }

    const onDone = () => {
        setSignedOut(null)
        setAdviceShown(false)
        setSignOutError(null)
    }

    return {
        visible: door.isOpen || signedOut !== null,
        stage,
        waiting: door.waiting,
        device: signedOut ?? door.device,
        since,
        code,
        setCode,
        canApprove: doorCanApprove(view, code) && !signingOut,
        error: typedError ?? signOutError ?? refusalWording(view?.refused ?? null),
        wrongCodeBefore: view?.note === "wrong-code",
        failure: view?.stage === "failed" ? failureWording(view.failure ?? "error", door.device) : null,
        onApprove,
        onCancel: () => answering?.cancel().catch((error: unknown) => warnE2ee("cancelling the exchange", error)),
        signingOut,
        onNotMe,
        onClose: close,
        onDone,
        adviceShown,
        advice: passwordAdvice(howToChange, instanceHost(idpUrl), "theirs too"),
        showAdvice: () => setAdviceShown(true),
        /** The scrim and the back gesture: nothing while the exchange works or a device is being signed out. */
        onDismiss: stage === "working" || signingOut ? undefined : stage === "signed-out" ? onDone : close,
        recentSignIn,
    }
}

export type ApprovalDoorViewModel = ReturnType<typeof useApprovalDoorViewModel>
