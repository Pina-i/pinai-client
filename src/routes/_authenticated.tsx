import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@/adapters/auth/token"
import { ensureAuthenticatedUseCase } from "@/domain/usecases/auth/ensureAuthenticated.usecase"
import { getAuthPort } from "@/ioc/index"
import { useIdpWebSocket } from "@/presentation/hooks/useIdpWebSocket"
import { useLoadPendingNotifications } from "@/presentation/hooks/useLoadPendingNotifications"
import { useLoadDmConversations } from "@/presentation/hooks/useLoadDmConversations"
import { useHeartbeat } from "@/presentation/hooks/useHeartbeat"
import { useTypingPruner } from "@/presentation/hooks/useTypingPruner"
import { useLoadPresence } from "@/presentation/hooks/useLoadPresence"
import { HomeLayout } from "@/presentation/templates/HomeLayout/HomeLayout"

function AuthenticatedLayout() {
    useIdpWebSocket()
    useHeartbeat()
    useTypingPruner()
    useLoadPendingNotifications()
    useLoadDmConversations()
    useLoadPresence()
    return (
        <HomeLayout>
            <Outlet />
        </HomeLayout>
    )
}

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: async () => {
        const { accessToken, idpUrl } = useAppStore.getState()
        try {
            await ensureAuthenticatedUseCase(isTokenValid(accessToken), idpUrl, getAuthPort())
        } catch {
            throw redirect({ to: "/" })
        }
    },
    component: AuthenticatedLayout,
})
