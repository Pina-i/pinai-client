import { useCallback, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { getAuthPort, getTotpPort } from "@/ioc/index"
import { useAppStore } from "@/store/store"

type Pane = "idle" | "disable" | "regenerate"

export function useSecurityEditorViewModel() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const user = useAppStore((s) => s.user)
    const setUser = useAppStore((s) => s.setUser)
    const setPendingRecoveryCodes = useAppStore((s) => s.setPendingRecoveryCodes)

    const [pane, setPane] = useState<Pane>("idle")
    const [code, setCode] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const navigate = useNavigate()

    const reset = useCallback(() => {
        setPane("idle")
        setCode("")
        setError(null)
        setBusy(false)
    }, [])

    const refreshProfile = useCallback(async () => {
        if (!idpUrl || !accessToken) return
        try {
            const cfg = await getAuthPort().discoverConfig(idpUrl)
            const profile = await getAuthPort().fetchUserInfo(cfg.userinfo_endpoint, accessToken)
            setUser(profile)
        } catch {
            // Non-fatal — next load will refresh.
        }
    }, [accessToken, idpUrl, setUser])

    const startEnroll = useCallback(() => {
        navigate({ to: "/settings/totp/enroll" })
    }, [navigate])

    const submitDisable = useCallback(async () => {
        if (!idpUrl || !accessToken) return
        if (code.length !== 6) {
            setError("Enter the 6-digit code")
            return
        }
        setBusy(true)
        setError(null)
        try {
            await getTotpPort().disable(idpUrl, accessToken, code)
            await refreshProfile()
            reset()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to disable 2FA")
        } finally {
            setBusy(false)
        }
    }, [accessToken, code, idpUrl, refreshProfile, reset])

    const submitRegenerate = useCallback(async () => {
        if (!idpUrl || !accessToken) return
        if (code.length !== 6) {
            setError("Enter the 6-digit code")
            return
        }
        setBusy(true)
        setError(null)
        try {
            const res = await getTotpPort().regenerateRecoveryCodes(idpUrl, accessToken, code)
            setPendingRecoveryCodes(res.recovery_codes)
            navigate({ to: "/settings/totp/recovery-codes" })
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to regenerate codes")
        } finally {
            setBusy(false)
        }
    }, [accessToken, code, idpUrl, navigate, setPendingRecoveryCodes])

    return {
        totpEnabled: user?.totp_enabled ?? false,
        pane,
        setPane,
        code,
        setCode,
        error,
        busy,
        startEnroll,
        submitDisable,
        submitRegenerate,
        reset,
    }
}
