import { createFileRoute } from "@tanstack/react-router"
import { requireSession } from "@/routes/-require-session"
import { RecoveryRestorePage } from "@/presentation/pages/onboarding/RecoveryRestorePage/RecoveryRestorePage"

/** Where the gate keeps a device that never held the passphrase; also Settings → Devices → "Restore history". */
export const Route = createFileRoute("/onboarding/recovery-restore")({
    beforeLoad: requireSession,
    component: RecoveryRestorePage,
})
