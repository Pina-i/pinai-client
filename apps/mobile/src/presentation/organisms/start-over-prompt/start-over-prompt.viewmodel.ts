import { isApprovalRequired, isUnreachable } from "@pinai/domain/models/idp-error"
import { instanceHost } from "@pinai/domain/models/instance"
import { passwordAdvice } from "@pinai/domain/models/instance-admin"
import { ONLY_APPROVED_REVOKES } from "@pinai/domain/models/device-roster"
import { shownDeviceName } from "@pinai/domain/models/device"
import { askedLine } from "@pinai/domain/models/relative-time"
import { endStartOverUseCase, type StartOverPrompt } from "@pinai/domain/usecases/e2ee/start-over-request.usecase"
import { usePathname } from "expo-router"
import { useState } from "react"
import { getStartOverPort } from "@/ioc"
import { signOutDevice } from "@/presentation/_libs/sign-out-device"
import { putOffPrompt, readStartOverPrompt, useStartOverPrompt } from "@/presentation/_libs/start-over-prompt"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useClock } from "@/presentation/hooks/use-clock"
import { usePasswordChange } from "@/presentation/hooks/use-password-change"
import { useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { startOverRefusalLine } from "@/presentation/organisms/start-over-way/start-over-wording"
import { useAppStore } from "@/store/store"

/** `asked`: the request and its answers; `guide`: "It's me"'s way; `cancelled`: what to do about the password. */
export type PromptStage = "asked" | "guide" | "cancelled"

/** Another device asked to start the history over: the web's prompt, as a sheet in the Door's look. */
export function useStartOverPromptViewModel() {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const pathname = usePathname()
    const recentSignIn = useRecentSignIn(() => pathname)
    const shown = useStartOverPrompt()
    // Kept past the request's end while it says what to do next.
    const [held, setHeld] = useState<{ prompt: StartOverPrompt; stage: Exclude<PromptStage, "asked"> } | null>(null)
    const [cancelling, setCancelling] = useState(false)
    const [signingOut, setSigningOut] = useState(false)
    const [signedOut, setSignedOut] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const prompt = held?.prompt ?? shown
    const request = prompt?.request ?? null
    const stage: PromptStage = held?.stage ?? "asked"
    const now = useClock(request !== null)
    const howToChange = usePasswordChange(stage === "cancelled")

    const onCancel = () => {
        const accessToken = useAppStore.getState().accessToken
        if (!prompt || !idpUrl || !accessToken || cancelling) return
        setCancelling(true)
        setError(null)
        endStartOverUseCase({ startOverPort: getStartOverPort() })(idpUrl, accessToken, prompt.request.id)
            .then((ended) => {
                // Gone already — withdrawn, approved, cancelled elsewhere —: nothing left to say here.
                if (ended === "ended") setHeld({ prompt, stage: "cancelled" })
                else putOffPrompt(prompt.request.id)
                readStartOverPrompt().catch((e: unknown) => warnE2ee("reading another device's start over request", e))
            })
            .catch((e: unknown) => {
                warnE2ee("cancelling the start over request", e)
                setError(startOverRefusalLine(e, "cancel"))
            })
            .finally(() => setCancelling(false))
    }

    const onSignOut = () => {
        if (!prompt || signingOut) return
        setSigningOut(true)
        setError(null)
        signOutDevice(prompt.request.deviceId)
            .then(() => setSignedOut(true))
            .catch((e: unknown) => {
                if (recentSignIn.refused(e, "sign that device out")) return
                warnE2ee("signing the device out", e)
                setError(isApprovalRequired(e) ? `${ONLY_APPROVED_REVOKES}.` : isUnreachable(e) ? "Couldn't reach your instance. Try again." : "Couldn't sign it out. Try again.")
            })
            .finally(() => setSigningOut(false))
    }

    const onDone = () => {
        if (held) putOffPrompt(held.prompt.request.id)
        setHeld(null)
        setSignedOut(false)
        setError(null)
    }

    const onNotNow = () => {
        if (request) putOffPrompt(request.id)
        setError(null)
    }

    const busy = cancelling || signingOut
    return {
        visible: request !== null,
        stage,
        answersCodes: prompt?.answersCodes ?? false,
        device: shownDeviceName(request?.displayName),
        asked: request ? askedLine(request.createdAt, now, "") : "",
        advice: passwordAdvice(howToChange, instanceHost(idpUrl), "theirs too"),
        cancelling,
        signingOut,
        signedOut,
        error,
        onCancel,
        onItsMe: () => prompt && setHeld({ prompt, stage: "guide" }),
        onNotNow,
        onSignOut,
        onDone,
        /** The scrim and the back gesture: "Not now" while asked, "Done" after; nothing while a call is under way. */
        onDismiss: busy ? undefined : stage === "asked" ? onNotNow : onDone,
        recentSignIn,
    }
}

export type StartOverPromptViewModel = ReturnType<typeof useStartOverPromptViewModel>
