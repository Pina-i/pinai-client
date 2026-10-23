import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { handleCallbackUseCase } from "@pinai/domain/usecases/auth/handleCallback.usecase"
import { rememberInstanceUseCase } from "@pinai/domain/usecases/instance/recent-instances.usecase"
import { useAppStore } from "@/store/store"
import { getAuthPlatform, getAuthPort, getAuthSessionStore, getRecentInstancesPort } from "@/ioc/index"
import { useHoldSplashScreen } from "@/presentation/hooks/use-hold-splash-screen"

export interface CallbackFailure {
    message: string
    /** The IdP's `error` code, when it sent one. */
    code: string | null
}

export function useCallbackPageViewModel() {
    const [failure, setFailure] = useState<CallbackFailure | null>(null)
    const setSession = useAppStore((s) => s.setSession)
    const navigate = useNavigate()
    // Held through the navigation that follows: the next screen takes over the hold in the same commit.
    useHoldSplashScreen(failure === null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)

        // Guard against React StrictMode double-invocation: if the answer was
        // already consumed and removed from the URL, skip silently.
        if (!params.has("code") && !params.has("error")) return

        // Remove the answer from the URL immediately so a second run
        // (StrictMode or back-navigation) finds nothing to exchange.
        window.history.replaceState({}, "", window.location.pathname)

        handleCallbackUseCase(params, getAuthPort(), getAuthPlatform())
            .then((result) => {
                switch (result.kind) {
                    case "signed-in": {
                        const { accessToken, user, idpUrl } = result.session
                        setSession(accessToken, user, idpUrl)
                        rememberInstanceUseCase(idpUrl, getRecentInstancesPort())
                        const redirect = getAuthSessionStore().get("post_login_redirect")
                        getAuthSessionStore().remove("post_login_redirect")
                        void navigate({ href: redirect ?? "/home" })
                        break
                    }
                    case "cancelled":
                        // "Another home" on the IdP: back to picking one, nothing to say — or, asked
                        // for the password again, back where the user was, still signed in.
                        void navigate({ href: result.returnTo ?? "/", replace: true })
                        break
                    case "refused":
                        setFailure({ message: "Your identity provider ended the sign-in.", code: result.error })
                        break
                }
            })
            .catch((err: unknown) => {
                setFailure({ message: err instanceof Error ? err.message : "Authentication failed", code: null })
            })
        // Run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return { failure }
}
