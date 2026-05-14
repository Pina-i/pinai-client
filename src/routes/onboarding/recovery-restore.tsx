import { createFileRoute, redirect } from "@tanstack/react-router"
import { isTokenValid } from "@/adapters/auth/token"
import { ensureAuthenticatedUseCase } from "@/domain/usecases/auth/ensureAuthenticated.usecase"
import { getAuthPort } from "@/ioc/index"
import { useAppStore } from "@/store/store"
import { RecoveryRestorePage } from "@/presentation/pages/onboarding/RecoveryRestorePage/RecoveryRestorePage"

export const Route = createFileRoute("/onboarding/recovery-restore")({
    // See sibling route for rationale — silent re-auth on hard refresh.
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
