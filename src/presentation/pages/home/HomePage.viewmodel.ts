import { useAppStore } from "@/store/store"
import { logoutUseCase } from "@/domain/usecases/auth/logout.usecase"

export function useHomePageViewModel() {
    const { user, idpUrl, clearSession } = useAppStore()

    function handleLogout() {
        logoutUseCase(idpUrl!, clearSession)
    }

    return { user, handleLogout }
}
