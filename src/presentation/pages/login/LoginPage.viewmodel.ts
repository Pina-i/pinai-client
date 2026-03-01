import { useState } from "react"

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
    const idpUrl = sessionStorage.getItem("idp_url") ?? ""

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

    return { idpUrl, oidcParams, activeTab, setActiveTab, error }
}
