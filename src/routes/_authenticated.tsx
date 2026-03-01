import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@/adapters/auth/token"
import { startLoginUseCase } from "@/domain/usecases/startLogin.usecase"
import { getAuthPort } from "@/ioc/index"

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: async () => {
        if (isTokenValid(useAppStore.getState().accessToken)) return

        // Access token is gone (page refresh) but the IdP session cookie may still
        // be valid. Trigger the OIDC flow — the IdP will skip the login form if the
        // cookie is present and redirect back silently.
        const idpUrl = useAppStore.getState().idpUrl
        if (idpUrl) {
            try {
                await startLoginUseCase(idpUrl, getAuthPort())
                // startLoginUseCase sets window.location.href and never returns
            } catch {
                // IdP unreachable or discovery failed — fall back to landing page
                throw redirect({ to: "/" })
            }
        } else {
            throw redirect({ to: "/" })
        }
    },
    component: () => <Outlet />,
})
