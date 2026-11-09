/** How a hidden window comes back: the tray's icon, the Dock's, or launching the app again (GNOME, no tray). */
export type ComesBackBy = "tray" | "dock" | "launch"

export interface KeepRunningSetting {
    keepRunning: boolean
    comesBackBy: ComesBackBy
}

/** Only the desktop app has a window to close: a browser's IoC gives none. */
export interface IKeepRunningPort {
    get(): Promise<KeepRunningSetting>
    set(keepRunning: boolean): Promise<void>
}
