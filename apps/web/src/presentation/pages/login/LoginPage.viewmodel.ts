import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { getAuthSessionStore } from "@/ioc/index"

export type LoginTab = "signin" | "register"

export interface OidcParams {
    client_id: string
    redirect_uri: string
    scope: string
    state: string
    code_challenge: string
    code_challenge_method: string
    nonce?: string
}

export function useLoginPageViewModel() {
    const search = new URLSearchParams(window.location.search)

    // The IdP sets ?tab=register when redirecting back after a registration error
    const initialTab: LoginTab = search.get("tab") === "register" ? "register" : "signin"
    const [activeTab, setActiveTab] = useState<LoginTab>(initialTab)

    // IdP URL stored by startLoginUseCase before redirecting to /authorize
    const idpUrl = getAuthSessionStore().get("idp_url") ?? ""

    // OIDC params forwarded by the IdP's /authorize redirect
    const oidcParams: OidcParams = {
        client_id: search.get("client_id") ?? "",
        redirect_uri: search.get("redirect_uri") ?? "",
        scope: search.get("scope") ?? "",
        state: search.get("state") ?? "",
        code_challenge: search.get("code_challenge") ?? "",
        code_challenge_method: search.get("code_challenge_method") ?? "",
        nonce: search.get("nonce") ?? undefined,
    }

    // Error message set by the IdP when credentials are invalid or registration fails
    const error = search.get("error")

    const navigate = useNavigate()

    /**
     * Cancel the in-flight OIDC flow and return to the landing page so the
     * user can pick a different IdP. We drop the PKCE artefacts so the next
     * `startLoginUseCase` doesn't reuse a verifier the IdP has already seen.
     */
    function handleBack() {
        getAuthSessionStore().clear()
        navigate({ to: "/" })
    }

    /** Display-only host stripped of scheme + trailing slash, e.g. `localhost:8080`. */
    const idpHost = (() => {
        if (!idpUrl) return ""
        try {
            return new URL(idpUrl).host
        } catch {
            return idpUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
        }
    })()

    return { idpUrl, idpHost, oidcParams, activeTab, setActiveTab, error, handleBack }
}
