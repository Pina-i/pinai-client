import { createFileRoute } from "@tanstack/react-router"
import { requireSession } from "@/routes/-require-session"
import { TotpRecoveryCodesPage } from "@/presentation/pages/totp-recovery-codes/TotpRecoveryCodesPage"

export const Route = createFileRoute("/settings/totp/recovery-codes")({
    beforeLoad: requireSession,
    component: TotpRecoveryCodesPage,
})
