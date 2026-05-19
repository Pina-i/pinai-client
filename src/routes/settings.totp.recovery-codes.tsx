import { createFileRoute, redirect } from "@tanstack/react-router"
import { isTokenValid } from "@/adapters/auth/token"
import { useAppStore } from "@/store/store"
import { TotpRecoveryCodesPage } from "@/presentation/pages/totp-recovery-codes/TotpRecoveryCodesPage"

export const Route = createFileRoute("/settings/totp/recovery-codes")({
    beforeLoad: () => {
        const { accessToken } = useAppStore.getState()
        if (!isTokenValid(accessToken)) {
            throw redirect({ to: "/login" })
        }
    },
    component: TotpRecoveryCodesPage,
})
