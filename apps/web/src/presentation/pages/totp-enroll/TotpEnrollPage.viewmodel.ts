import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAppStore } from "@/store/store"
import { getAuthPort, getTotpPort } from "@/ioc/index"

export function useTotpEnrollPageViewModel() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const user = useAppStore((s) => s.user)
    const setUser = useAppStore((s) => s.setUser)
    const setPendingRecoveryCodes = useAppStore((s) => s.setPendingRecoveryCodes)

    const [provisioningUrl, setProvisioningUrl] = useState<string | null>(null)
    const [secretBase32, setSecretBase32] = useState<string | null>(null)
    const [bootError, setBootError] = useState<string | null>(null)
    const [code, setCode] = useState("")
    const [verifyError, setVerifyError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const navigate = useNavigate()

    useEffect(() => {
        if (!accessToken || !idpUrl) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await getTotpPort().startEnrollment(idpUrl, accessToken)
                if (cancelled) return
                setProvisioningUrl(res.provisioning_url)
                setSecretBase32(res.secret_base32)
            } catch (e) {
                if (!cancelled) setBootError(e instanceof Error ? e.message : "Failed to start enrollment")
            }
        })()
        return () => {
            cancelled = true
        }
    }, [accessToken, idpUrl])

    const verify = useCallback(async () => {
        if (!accessToken || !idpUrl) return
        if (code.length !== 6) {
            setVerifyError("Enter the 6-digit code")
            return
        }
        setSubmitting(true)
        setVerifyError(null)
        try {
            const res = await getTotpPort().verifyEnrollment(idpUrl, accessToken, code)
            setPendingRecoveryCodes(res.recovery_codes)

            // Refresh /userinfo so the Settings pane + any gates pick up
            // `totp_enabled: true` without a hard reload.
            try {
                const cfg = await getAuthPort().discoverConfig(idpUrl)
                const profile = await getAuthPort().fetchUserInfo(cfg.userinfo_endpoint, accessToken)
                setUser(profile)
            } catch {
                // Non-fatal — next page load will refresh /userinfo anyway.
            }

            navigate({ to: "/settings/totp/recovery-codes" })
        } catch (e) {
            setVerifyError(e instanceof Error ? e.message : "Verification failed")
        } finally {
            setSubmitting(false)
        }
    }, [accessToken, idpUrl, code, navigate, setPendingRecoveryCodes, setUser])

    return {
        provisioningUrl,
        secretBase32,
        bootError,
        code,
        setCode,
        verifyError,
        submitting,
        verify,
        userEmail: user?.email ?? "",
    }
}
