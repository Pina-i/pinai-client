import type { HeldRefreshToken, ISessionTokenStore } from "@pinai/domain/ports/auth.port"

import type { DesktopBridge } from "./desktop-bridge"

/**
 * {@link ISessionTokenStore} for the desktop renderer: the refresh token is handed to the main
 * process and never comes back. Renewals run there (`DesktopBridge.session.renew`), so the page
 * has nothing to take.
 */
export class DesktopSessionTokenStore implements ISessionTokenStore {
    private readonly bridge: DesktopBridge

    constructor(bridge: DesktopBridge) {
        this.bridge = bridge
    }

    set(held: HeldRefreshToken): void {
        void this.bridge.session.store(held)
    }

    take(): HeldRefreshToken | null {
        return null
    }

    clear(): void {
        void this.bridge.session.clear()
    }
}
