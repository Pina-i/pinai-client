import type { IAuthNavigationPort } from "@pinai/domain/ports/auth.port"

import type { DesktopBridge } from "./desktop-bridge"

/** Where every IdP serves the desktop app's client document: its `client_id` there. */
export const DESKTOP_DOCUMENT_PATH = "/clients/desktop.json"
/** The callback every IdP's desktop document lists: the main process hands it to this window. */
export const DESKTOP_REDIRECT_URI = "io.github.pina-i:/callback"

/**
 * {@link IAuthNavigationPort} for the desktop: the IdP's pages open in the system browser (RFC
 * 8252), which comes back through the `io.github.pina-i:` deep link; the app's own pages load in
 * its window.
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
        else void this.bridge.openExternal(url)
    }
}
