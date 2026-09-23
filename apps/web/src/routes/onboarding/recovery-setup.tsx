import { createFileRoute } from "@tanstack/react-router"
import { requireSession } from "@/routes/-require-session"
import { RecoverySetupPage } from "@/presentation/pages/onboarding/RecoverySetupPage/RecoverySetupPage"

export const Route = createFileRoute("/onboarding/recovery-setup")({
    // Match `_authenticated`'s behaviour so a hard refresh on the
    // onboarding page doesn't bounce the user back to the landing
    // page. `ensureAuthenticated` does a silent OIDC re-auth via the
    // IdP session cookie when the in-memory access token is gone;
    // only falls through to the landing redirect when no IdP URL is
    // configured (true fresh-install case).
    beforeLoad: requireSession,
    component: RecoverySetupPage,
})
