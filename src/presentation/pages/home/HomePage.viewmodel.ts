import { useAppStore } from "@/store/store"

export function useHomePageViewModel() {
    const { user, idpUrl, clearSession } = useAppStore()

    function handleLogout() {
        clearSession()
        const postLogoutRedirect = encodeURIComponent(window.location.origin)
        window.location.href = `${idpUrl}/logout?post_logout_redirect_uri=${postLogoutRedirect}`
    }

    return { user, handleLogout }
}
