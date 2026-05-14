import { createFileRoute, redirect } from "@tanstack/react-router"
import { isTokenValid } from "@/adapters/auth/token"
import { ensureAuthenticatedUseCase } from "@/domain/usecases/auth/ensureAuthenticated.usecase"
import { getAuthPort } from "@/ioc/index"
import { useAppStore } from "@/store/store"
import { RecoveryRestorePage } from "@/presentation/pages/onboarding/RecoveryRestorePage/RecoveryRestorePage"

/**
 * Phase 7 — `/onboarding/recovery-restore`. Optional entry point for a
 * user who wants to pull their message history onto a new device. The
 * gate doesn't auto-route here (per-device identity means a fresh
 * device just registers itself in setup); this route is reachable via
 * Settings → Devices → "Restore history" (UI link landing in a
 * follow-up) and via direct URL during testing.
 */
export const Route = createFileRoute("/onboarding/recovery-restore")({
    beforeLoad: async () => {
        const { accessToken, idpUrl } = useAppStore.getState()
        try {
            await ensureAuthenticatedUseCase(isTokenValid(accessToken), idpUrl, getAuthPort())
        } catch {
            throw redirect({ to: "/" })
        }
    },
    component: RecoveryRestorePage,
})
