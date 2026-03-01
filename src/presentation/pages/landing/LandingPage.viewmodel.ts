import { useState } from "react"
import { startLoginUseCase } from "@/domain/usecases/auth/startLogin.usecase"
import { getAuthPort } from "@/ioc/index"

const DEFAULT_IDP_URL =
    import.meta.env.VITE_DEFAULT_IDP_URL ?? "http://localhost:8080"

export function useLandingPageViewModel() {
    const [idpUrl, setIdpUrl] = useState<string>(
        () => sessionStorage.getItem("idp_url") ?? DEFAULT_IDP_URL,
    )
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleLogin() {
        setLoading(true)
        setError(null)
        try {
            await startLoginUseCase(idpUrl, getAuthPort())
            // startLoginUseCase redirects the browser — no further action needed
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed")
            setLoading(false)
        }
    }

    return { idpUrl, setIdpUrl, loading, error, handleLogin }
}
