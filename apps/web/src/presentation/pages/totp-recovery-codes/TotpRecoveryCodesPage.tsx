import { useEffect } from "react"
import { ShieldCheck } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/presentation/atoms/Button/Button"
import { RecoveryCodesGrid } from "@/presentation/molecules/RecoveryCodesGrid/RecoveryCodesGrid"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { useAppStore } from "@/store/store"

const LEFT_HEADLINE = (
    <>
        Keep these <em className="italic text-acc">safe.</em>
    </>
)
const LEFT_DESCRIPTION =
    "These ten codes work exactly once and only matter if you lose access to your authenticator. We won't show them again."

export function TotpRecoveryCodesPage() {
    const codes = useAppStore((s) => s.pendingRecoveryCodes)
    const setPending = useAppStore((s) => s.setPendingRecoveryCodes)
    const navigate = useNavigate()

    // Stale visit (refresh, deep-link) — codes are one-time, send to /home.
    useEffect(() => {
        if (codes === null || codes.length === 0) {
            navigate({ to: "/home" })
        }
    }, [codes, navigate])

    if (!codes || codes.length === 0) return null

    function done() {
        setPending(null)
        navigate({ to: "/home" })
    }

    return (
        <AuthShell leftHeadline={LEFT_HEADLINE} leftDescription={LEFT_DESCRIPTION}>
            <div className="mb-7">
                <p className="eye">— 2FA enabled</p>
                <h2 className="title mt-2 text-[32px] font-normal tracking-[-0.015em] text-foreground">
                    Save your recovery codes
                </h2>
                <p className="mt-2 max-w-sm text-[13.5px] leading-[1.55] text-muted-foreground">
                    Store these somewhere safe. Each code works exactly once and gets you in if
                    you ever lose access to your authenticator. We can't show them again.
                </p>
            </div>

            <RecoveryCodesGrid codes={codes} className="mb-6" />

            <Button onPress={done}>
                <ShieldCheck size={15} />
                I've saved these — continue
            </Button>
        </AuthShell>
    )
}
