import { createFileRoute } from "@tanstack/react-router"
import { requireSession } from "@/routes/-require-session"
import { TotpEnrollPage } from "@/presentation/pages/totp-enroll/TotpEnrollPage"

export const Route = createFileRoute("/settings/totp/enroll")({
    beforeLoad: requireSession,
    component: TotpEnrollPage,
})
