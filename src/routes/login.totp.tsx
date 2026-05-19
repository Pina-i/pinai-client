import { createFileRoute, redirect } from "@tanstack/react-router"
import { TotpChallengePage } from "@/presentation/pages/totp-challenge/TotpChallengePage"

export const Route = createFileRoute("/login/totp")({
    beforeLoad: () => {
        if (!new URLSearchParams(window.location.search).get("ticket")) {
            throw redirect({ to: "/login" })
        }
    },
    component: TotpChallengePage,
})
