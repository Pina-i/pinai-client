import type { AppUpdate } from "@pinai/domain/ports/app-updates.port"
import type { HeldRefreshToken } from "@pinai/domain/ports/auth.port"
import type { KeepRunningSetting } from "@pinai/domain/ports/keep-running.port"
import type { TitleBarColors } from "@pinai/domain/ports/window-frame.port"
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
    /** The installed app's updates, run by the main process (`apps/desktop/src/main/updates.ts`). */
    updates: {
        status(): Promise<AppUpdate>
        onChange(listener: (update: AppUpdate) => void): () => void
        /** Installs the downloaded update, restarting the app. */
        restart(): Promise<void>
        /** Opens the new version's download, on a Mac that can't install it itself. */
        download(): Promise<void>
    }
    /** The window the app draws its own title bar in (`apps/desktop/src/main/window-frame.ts`). */
    window: {
        /** Colours the system's buttons over the page's title bar. */
        paintTitleBar(colors: TitleBarColors): Promise<void>
        /** The count on the app's icon, 0 clearing it; `image`, a PNG data URL, is Windows' overlay. */
        setBadge(count: number, image: string | null): Promise<void>
        /** Whether closing the window keeps the app running (`apps/desktop/src/main/keep-running.ts`). */
        keepRunning(): Promise<KeepRunningSetting>
        setKeepRunning(keepRunning: boolean): Promise<void>
    }
}

export function desktopBridge(): DesktopBridge {
    const bridge = (window as { pinaiDesktop?: DesktopBridge }).pinaiDesktop
    if (!bridge) throw new Error("Built for the desktop app, but no bridge was exposed")
    return bridge
}
