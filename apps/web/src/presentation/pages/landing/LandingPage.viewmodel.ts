import { useState } from "react"
import { startLoginUseCase } from "@pinai/domain/usecases/auth/startLogin.usecase"
import { getAuthPlatform, getAuthPort, getAuthSessionStore } from "@/ioc/index"

const DEFAULT_IDP_URL =
    import.meta.env.VITE_DEFAULT_IDP_URL ?? "http://localhost:8080"

/**
 * `form`        — the IdP picker is visible and editable.
 * `connecting`  — Continue was pressed; we're discovering the IdP and about to
 *                 hand off the browser to its `/authorize` endpoint. The right
 *                 column shows the Rise loader so the imminent OIDC redirect
 *                 doesn't feel like an abrupt page reload.
 */
export type LandingView = "form" | "connecting"

export function useLandingPageViewModel() {
    const [idpUrl, setIdpUrl] = useState<string>(
        () => getAuthSessionStore().get("idp_url") ?? DEFAULT_IDP_URL,
    )
    const [view, setView] = useState<LandingView>("form")
    const [error, setError] = useState<string | null>(null)

    async function handleLogin() {
        setError(null)
        // Flip the right-column to its loader BEFORE the network call so the
        // transition is visible even on a fast/cached IdP discovery response.
        setView("connecting")
        try {
            await startLoginUseCase(idpUrl, getAuthPort(), getAuthPlatform())
            // startLoginUseCase calls `window.location.href = …` so this
            // promise never resolves on the happy path; the browser leaves
            // before we get here.
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed")
            setView("form")
        }
    }

    const loading = view === "connecting"
    return { idpUrl, setIdpUrl, idpHost: prettyHost(idpUrl), view, loading, error, handleLogin }
}

/** Strip protocol + trailing slashes for the loader's host line. */
function prettyHost(url: string): string {
    try {
        return new URL(url).host
    } catch {
        return url.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    }
}
