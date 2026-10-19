import { createFileRoute, redirect } from "@tanstack/react-router"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@pinai/domain/models/auth"
import { startLoginUseCase } from "@pinai/domain/usecases/auth/startLogin.usecase"
import { getAuthPlatform, getAuthPort } from "@/ioc/index"

// The sign-in form is the IdP's own page. This only restarts a sign-in for a known IdP, for
// whatever still sends someone here without a token.
export const Route = createFileRoute("/login")({
    beforeLoad: async () => {
        const { accessToken, idpUrl } = useAppStore.getState()
        if (isTokenValid(accessToken)) throw redirect({ to: "/home" })
        if (!idpUrl) throw redirect({ to: "/" })
        try {
            // On the web this navigates away and never returns.
            await startLoginUseCase(idpUrl, getAuthPort(), getAuthPlatform())
        } catch {
            throw redirect({ to: "/" })
        }
    },
})
