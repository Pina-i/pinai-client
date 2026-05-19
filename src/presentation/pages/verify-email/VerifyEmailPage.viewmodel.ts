import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

export interface VerifyOidcParams {
    client_id: string
    redirect_uri: string
    scope: string
    state: string
    code_challenge: string
    code_challenge_method: string
    nonce?: string
}

/** Cooldown imposed after a successful resend — matches the 0:56 in the design. */
const RESEND_COOLDOWN_SECS = 60

export function useVerifyEmailPageViewModel() {
    const search = new URLSearchParams(window.location.search)
    const pendingUserId = search.get("pending_user_id") ?? ""
    const pendingEmail = search.get("pending_email") ?? ""
    const error = search.get("error")

    const idpUrl = sessionStorage.getItem("idp_url") ?? ""

    const oidcParams: VerifyOidcParams = {
        client_id: search.get("client_id") ?? "",
        redirect_uri: search.get("redirect_uri") ?? "",
        scope: search.get("scope") ?? "",
        state: search.get("state") ?? "",
        code_challenge: search.get("code_challenge") ?? "",
        code_challenge_method: search.get("code_challenge_method") ?? "",
        nonce: search.get("nonce") ?? undefined,
    }

    const [code, setCode] = useState("")
    /** Brief success after a resend — drives the green status row. */
    const [justResent, setJustResent] = useState(false)
    /** Seconds until resend is allowed again (0 = idle). */
    const [cooldown, setCooldown] = useState(0)
    const [resending, setResending] = useState(false)
    const [resendError, setResendError] = useState<string | null>(null)

    const formRef = useRef<HTMLFormElement | null>(null)

    useEffect(() => {
        if (cooldown <= 0) return
        const id = window.setInterval(() => {
            setCooldown((s) => (s > 0 ? s - 1 : 0))
        }, 1000)
        return () => window.clearInterval(id)
    }, [cooldown])

    const submitForm = useCallback(() => {
        formRef.current?.requestSubmit()
    }, [])

    const resend = useCallback(async () => {
        if (!idpUrl || !pendingUserId || cooldown > 0 || resending) return
        setResending(true)
        setResendError(null)
        try {
            const body = new URLSearchParams({ pending_user_id: pendingUserId })
            const res = await fetch(`${idpUrl}/verify-email/resend`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body,
            })
            if (res.status === 204) {
                setCode("")
                setJustResent(true)
                setCooldown(RESEND_COOLDOWN_SECS)
            } else if (res.status === 429) {
                setResendError("Too many requests — wait a moment.")
            } else if (res.status === 410) {
                setResendError("Already verified — try signing in.")
            } else {
                setResendError("Couldn't send. Try again in a moment.")
            }
        } catch {
            setResendError("Couldn't send. Try again in a moment.")
        } finally {
            setResending(false)
        }
    }, [idpUrl, pendingUserId, cooldown, resending])

    // Once the user starts typing again the "new code sent" toast is stale —
    // drop it so the validation row reflects current activity.
    useEffect(() => {
        if (code.length > 0) setJustResent(false)
    }, [code])

    const navigate = useNavigate()
    const goToLogin = useCallback(() => {
        navigate({ to: "/login" })
    }, [navigate])

    return {
        idpUrl,
        pendingUserId,
        pendingEmail,
        oidcParams,
        error,
        code,
        setCode,
        cooldown,
        resending,
        justResent,
        resendError,
        resend,
        submitForm,
        formRef,
        goToLogin,
    }
}
