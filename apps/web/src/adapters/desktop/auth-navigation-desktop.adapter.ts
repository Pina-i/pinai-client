import type { IAuthNavigationPort } from "@pinai/domain/ports/auth.port"

import type { DesktopBridge } from "./desktop-bridge"

/** Where every IdP serves the desktop app's client document: its `client_id` there. */
export const DESKTOP_DOCUMENT_PATH = "/clients/desktop.json"
/** The callback every IdP's desktop document lists: the main process catches it in the window. */
export const DESKTOP_REDIRECT_URI = "io.github.pina-i:/callback"

/**
 * {@link IAuthNavigationPort} for the desktop: the IdP's pages load in the app's own window, as
 * they do in the web app's tab. The main process lets the window go to that IdP only, and turns
 * its answer to the desktop callback into the app's `/callback`.
 */
export class DesktopAuthNavigationAdapter implements IAuthNavigationPort {
    private readonly bridge: DesktopBridge

    constructor(bridge: DesktopBridge) {
        this.bridge = bridge
    }

    callbackUrl(): string {
        return DESKTOP_REDIRECT_URI
    }

    postLogoutUrl(): string {
        return `${window.location.origin}/`
    }

    currentLocation(): string {
        return window.location.pathname + window.location.search
    }

    navigateTo(url: string): void {
        if (new URL(url, window.location.href).origin === window.location.origin) window.location.href = url
        else void this.bridge.signIn(url)
    }
}
