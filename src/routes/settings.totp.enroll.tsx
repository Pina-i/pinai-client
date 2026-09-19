import { createFileRoute, redirect } from "@tanstack/react-router"
import { isTokenValid } from "@/domain/models/auth"
import { useAppStore } from "@/store/store"
import { TotpEnrollPage } from "@/presentation/pages/totp-enroll/TotpEnrollPage"

export const Route = createFileRoute("/settings/totp/enroll")({
    beforeLoad: () => {
        const { accessToken } = useAppStore.getState()
        if (!isTokenValid(accessToken)) {
            throw redirect({ to: "/login" })
        }
    },
    component: TotpEnrollPage,
})
