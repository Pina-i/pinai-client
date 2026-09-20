import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { handleCallbackUseCase } from "@/domain/usecases/auth/handleCallback.usecase"
import { useAppStore } from "@/store/store"
import { getAuthPlatform, getAuthPort, getAuthSessionStore } from "@/ioc/index"

export function useCallbackPageViewModel() {
    const [error, setError] = useState<string | null>(null)
    const setSession = useAppStore((s) => s.setSession)
    const navigate = useNavigate()

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)

        // Guard against React StrictMode double-invocation: if the code was
        // already consumed and removed from the URL, skip silently.
        if (!params.has("code")) return

        // Remove the auth code from the URL immediately so a second run
        // (StrictMode or back-navigation) finds nothing to exchange.
        window.history.replaceState({}, "", window.location.pathname)

        handleCallbackUseCase(params, getAuthPort(), getAuthPlatform())
            .then(({ accessToken, user, idpUrl }) => {
                setSession(accessToken, user, idpUrl)
                const redirect = getAuthSessionStore().get("post_login_redirect")
                getAuthSessionStore().remove("post_login_redirect")
                void navigate({ to: redirect ?? "/home" })
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Authentication failed")
            })
        // Run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return { error }
}
