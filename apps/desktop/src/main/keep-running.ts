import { readFileSync, renameSync, writeFileSync } from "fs"

import type { ComesBackBy } from "@pinai/domain/ports/keep-running.port"
import type { MenuItemConstructorOptions } from "electron"

// GNOME shows no tray icon without the AppIndicator extension: a hidden window would look like a quit.
const isGnome = (desktop: string | undefined) => /gnome/i.test(desktop ?? "")

/** `desktop` is `XDG_CURRENT_DESKTOP`. */
export function keepRunningByDefault(desktop: string | undefined): boolean {
    return !isGnome(desktop)
}

export function comesBackBy(platform: NodeJS.Platform, desktop: string | undefined): ComesBackBy {
    return platform === "darwin" ? "dock" : isGnome(desktop) ? "launch" : "tray"
}

export function keepRunningOf(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null
}

export function readKeepRunning(file: string, byDefault: boolean): boolean {
    try {
        const { keepRunning } = JSON.parse(readFileSync(file, "utf8")) as { keepRunning?: unknown }
        return keepRunningOf(keepRunning) ?? byDefault
    } catch {
        return byDefault
    }
}

/** Whether it was kept. Written aside, then renamed: a torn write can't read back as the default. */
export function saveKeepRunning(file: string, keepRunning: boolean): boolean {
    try {
        writeFileSync(`${file}.tmp`, JSON.stringify({ keepRunning }))
        renameSync(`${file}.tmp`, file)
        return true
    } catch {
        return false
    }
}

/** This device's choice, from `userData/keep-running.json`; the page sets it in Settings. */
export class KeepRunningChoice {
    private readonly file: string
    private chosen: boolean

    constructor(file: string, byDefault: boolean) {
        this.file = file
        this.chosen = readKeepRunning(file, byDefault)
    }

    get current(): boolean {
        return this.chosen
    }

    /** Whether it changed. Throws on a choice it couldn't keep, so the page says so. */
    choose(value: unknown): boolean {
        const chosen = keepRunningOf(value)
        if (chosen === null) throw new Error("Not a keep-running choice")
        if (chosen === this.chosen) return false
        if (!saveKeepRunning(this.file, chosen)) throw new Error("The choice couldn't be saved")
        this.chosen = chosen
        return true
    }
}

export type CloseAction =
    /** The app runs on, its socket connected: the tray's icon, or the Dock's, brings the window back. */
    | "hide"
    /** The window goes: the app quits with it, except on macOS, where the Dock opens a new one. */
    | "close"

export function closeAction(keepRunning: boolean, quitting: boolean): CloseAction {
    return keepRunning && !quitting ? "hide" : "close"
}

export function quitsWithoutWindows(platform: NodeJS.Platform): boolean {
    return platform !== "darwin"
}

export const CRASH_RELOAD_SPACING_MS = 60_000

/** A renderer gone in a hidden window would leave a dead app; a crash loop reloads once a minute at most. */
export function reloadsAfterCrash(reason: string, lastReloadAt: number | null, now: number): boolean {
    return reason !== "clean-exit" && (lastReloadAt === null || now - lastReloadAt >= CRASH_RELOAD_SPACING_MS)
}

export interface FrontWindow {
    isMinimized(): boolean
    restore(): void
    show(): void
    focus(): void
}

/** A quit only stops a new window: a quit cancelled must not leave the tray, the Dock or a relaunch dead. */
export function showApp(window: FrontWindow | null, quitting: boolean, open: () => void): void {
    if (!window) {
        if (!quitting) open()
        return
    }
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
}

export interface SignInWindow {
    isVisible(): boolean
    showInactive(): void
}

/** A session ended elsewhere asks for the password in a hidden window: shown, without taking the focus. */
export function showForSignIn(window: SignInWindow): void {
    if (!window.isVisible()) window.showInactive()
}

export interface HidableWindow {
    isFullScreen(): boolean
    setFullScreen(on: boolean): void
    once(event: "leave-full-screen", listener: () => void): unknown
    hide(): void
}

export function hideWindow(window: HidableWindow, platform: NodeJS.Platform): void {
    // A macOS full screen hidden in place leaves its Space black.
    if (platform === "darwin" && window.isFullScreen()) {
        window.once("leave-full-screen", () => window.hide())
        window.setFullScreen(false)
    } else {
        window.hide()
    }
}

export interface AppEvents {
    on(event: "before-quit", listener: () => void): unknown
    on(event: "will-quit", listener: () => void): unknown
    on(event: "second-instance", listener: () => void): unknown
}

export interface UpdaterEvents {
    on(event: "before-quit-for-update", listener: () => void): unknown
}

export interface LifecycleParts {
    platform: NodeJS.Platform
    keepRunning(): boolean
    window(): (FrontWindow & HidableWindow) | null
    open(): void
    tray: { setShown(shown: boolean): void }
    badge: { clear(): void }
}

/** When the window hides and when it goes: a quit under way lets it go. */
export class AppLifecycle {
    private readonly parts: LifecycleParts
    private quitting = false

    constructor(app: AppEvents, updater: UpdaterEvents, parts: LifecycleParts) {
        this.parts = parts
        // Ctrl+Q, the tray's Quit, `app.quit()`, SIGTERM, a macOS logout.
        app.on("before-quit", () => {
            this.quitting = true
        })
        // Squirrel.Mac closes the windows before `before-quit`.
        updater.on("before-quit-for-update", () => {
            this.quitting = true
        })
        app.on("second-instance", () => this.show())
        app.on("will-quit", () => {
            parts.tray.setShown(false)
            parts.badge.clear()
        })
    }

    show(): void {
        showApp(this.parts.window(), this.quitting, this.parts.open)
    }

    /** The window's `close`. */
    close(event: { preventDefault(): void }): void {
        const window = this.parts.window()
        if (!window || closeAction(this.parts.keepRunning(), this.quitting) === "close") return
        event.preventDefault()
        hideWindow(window, this.parts.platform)
    }
}

// Electron's default menu, unseen under the window's own title bar, with Quit on Ctrl+Q where "Exit" has none.
export function appMenu(platform: NodeJS.Platform): MenuItemConstructorOptions[] {
    const mac = platform === "darwin"
    return [
        ...(mac ? [{ role: "appMenu" } as const] : []),
        mac ? { role: "fileMenu" } : { role: "fileMenu", submenu: [{ role: "quit", accelerator: "CommandOrControl+Q" }] },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
    ]
}
