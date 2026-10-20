import type { HeldRefreshToken } from "@pinai/domain/ports/auth.port"
import type { Renewal } from "@pinai/domain/usecases/auth/renew-session.usecase"

/**
 * What the desktop app's preload exposes as `window.pinaiDesktop` to the app's own pages — the
 * main process's half of the renderer. Kept in step with `apps/desktop/src/preload/index.ts` by
 * hand.
 */
export interface DesktopBridge {
    session: {
        /** Hands the refresh token over once, after the code exchange: the page keeps no copy. */
        store(held: HeldRefreshToken): Promise<void>
        /** A renewal run by the main process, which alone holds the refresh token. */
        renew(): Promise<Renewal>
        /** Revokes the refresh token at the IdP, then forgets it. */
        clear(): Promise<void>
    }
    /**
     * Shows the IdP's sign-in pages in this window, as the web app does in its tab; the IdP's
     * answer comes back to `/callback`.
     */
    signIn(url: string): Promise<void>
}

export function desktopBridge(): DesktopBridge {
    const bridge = (window as { pinaiDesktop?: DesktopBridge }).pinaiDesktop
    if (!bridge) throw new Error("Built for the desktop app, but no bridge was exposed")
    return bridge
}
