import { createFileRoute } from "@tanstack/react-router"
import { requireSession } from "@/routes/-require-session"
import { RecoveryRestorePage } from "@/presentation/pages/onboarding/RecoveryRestorePage/RecoveryRestorePage"

function HistoryResetPage() {
    return <RecoveryRestorePage variant="reset" />
}

/** Where the gate keeps a device whose words no longer give the key in force. */
export const Route = createFileRoute("/onboarding/history-reset")({
    beforeLoad: requireSession,
    component: HistoryResetPage,
})
