import type { IAuthNavigationPort } from "@pinai/domain/ports/auth.port"

/** Where every IdP serves the mobile app's client document: its `client_id` there. */
export const MOBILE_DOCUMENT_PATH = "/clients/mobile.json"
/** The callback every IdP's mobile document lists, the desktop's too: the app's own scheme. */
export const MOBILE_REDIRECT_URI = "io.github.pina-i:/callback"

export type SignInReturn = { kind: "returned"; params: Record<string, string> } | { kind: "cancelled" }

/** What the adapter takes from Expo: the router, and the system's sign-in sheet. */
export interface MobileNavigation {
    replace(pathname: string, params?: Record<string, string>): void
    openAuthSession(url: string, redirectUrl: string): Promise<{ type: string; url?: string }>
}

/**
 * {@link IAuthNavigationPort} for the phone: the IdP's pages open in the system's sheet over the
 * app (Chrome Custom Tabs), which hands back the IdP's answer to the app's callback; an in-app
 * path is a route.
 */
export class MobileAuthNavigationAdapter implements IAuthNavigationPort {
    private readonly nav: MobileNavigation
    private location = "/"

    constructor(nav: MobileNavigation) {
        this.nav = nav
    }

    callbackUrl(): string {
        return MOBILE_REDIRECT_URI
    }

    postLogoutUrl(): string {
        return "/"
    }

    currentLocation(): string {
        return this.location
    }

    /** The route on screen, as the root layout reports it. */
    track(location: string): void {
        this.location = location
    }

    navigateTo(url: string): void {
        if (url.startsWith("/")) {
            this.nav.replace(url)
            return
        }
        void this.openSignIn(url).then((back) =>
            back.kind === "returned" ? this.nav.replace("/callback", back.params) : this.nav.replace("/"),
        )
    }

    /** The IdP's pages in the system's sheet, until they answer the callback or the user closes them. */
    async openSignIn(url: string): Promise<SignInReturn> {
        const result = await this.nav.openAuthSession(url, MOBILE_REDIRECT_URI)
        if (result.type !== "success" || !result.url) return { kind: "cancelled" }
        return { kind: "returned", params: callbackParams(result.url) }
    }
}

/** The IdP's answer as query parameters (`io.github.pina-i:/callback?code=…&state=…`). */
export function callbackParams(url: string): Record<string, string> {
    const start = url.indexOf("?")
    if (start === -1) return {}
    return Object.fromEntries(new URLSearchParams(url.slice(start + 1).split("#")[0]))
}
