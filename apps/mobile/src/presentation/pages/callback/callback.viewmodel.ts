import { handleCallbackUseCase } from "@pinai/domain/usecases/auth/handleCallback.usecase"
import { rememberInstanceUseCase } from "@pinai/domain/usecases/instance/recent-instances.usecase"
import { router } from "expo-router"
import { useEffect, useState } from "react"
import { getAuthPlatform, getAuthPort, getRecentInstancesPort } from "@/ioc"
import { useAppStore } from "@/store/store"

export type CallbackFailure =
    /** Android killed the app while the IdP's pages were open: the sign-in's secrets went with it. */
    | { kind: "interrupted" }
    | { kind: "refused"; code: string | null }
    | { kind: "failed" }

// An answer is exchanged once, whoever routes it here — the hand-off, or the deep link itself.
const handled = new Set<string>()

export function useCallbackViewModel(params: Record<string, string>) {
    const [failure, setFailure] = useState<CallbackFailure | null>(() =>
        params.state && !handled.has(params.state) && getAuthPlatform().session.get("pkce_state") === null
            ? { kind: "interrupted" }
            : null,
    )

    useEffect(() => {
        const answer = new URLSearchParams(params)
        const state = answer.get("state")
        if (!state || handled.has(state) || failure) return
        handled.add(state)
        handleCallbackUseCase(answer, getAuthPort(), getAuthPlatform())
            .then((result) => {
                switch (result.kind) {
                    case "signed-in": {
                        const { accessToken, user, idpUrl } = result.session
                        useAppStore.getState().setSession(accessToken, user, idpUrl)
                        rememberInstanceUseCase(idpUrl, getRecentInstancesPort())
                        const session = getAuthPlatform().session
                        const redirect = session.get("post_login_redirect")
                        session.remove("post_login_redirect")
                        router.replace((redirect ?? "/home") as never)
                        break
                    }
                    case "cancelled":
                        // "← Another home" on the IdP's page: back to picking one — or, asked the password again, back where it was.
                        router.replace((result.returnTo ?? "/server") as never)
                        break
                    case "refused":
                        setFailure({ kind: "refused", code: result.error })
                        break
                }
            })
            .catch(() => setFailure({ kind: "failed" }))
        // Once per answer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.state])

    return { failure, tryAgain: () => router.replace("/server") }
}
