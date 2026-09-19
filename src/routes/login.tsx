import { createFileRoute, redirect } from "@tanstack/react-router"
import { LoginPage } from "@/presentation/pages/login/LoginPage"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@/adapters/auth/token"
import { startLoginUseCase } from "@/domain/usecases/auth/startLogin.usecase"
import { getAuthPlatform, getAuthPort } from "@/ioc/index"

export const Route = createFileRoute("/login")({
    beforeLoad: async () => {
        // Already in an active OIDC flow (IdP redirected here with params) — show the form
        const search = new URLSearchParams(window.location.search)
        if (search.has("client_id")) return

        const { accessToken, idpUrl } = useAppStore.getState()

        // Valid token in memory — nothing to do
        if (isTokenValid(accessToken)) {
            throw redirect({ to: "/home" })
        }

        // No IdP configured — redirect to landing to set one up
        if (!idpUrl) {
            throw redirect({ to: "/" })
        }

        // Token gone but IdP URL is known — attempt silent re-auth via session cookie.
        // If the cookie is still valid the IdP issues a code and we land on /home.
        // If not, the IdP redirects back to /login?{oidc_params} and the form is shown.
        try {
            await startLoginUseCase(idpUrl, getAuthPort(), getAuthPlatform())
            // startLoginUseCase sets window.location.href — never returns normally
        } catch {
            // IdP unreachable — go back to landing page
            throw redirect({ to: "/" })
        }
    },
    component: LoginPage,
})
