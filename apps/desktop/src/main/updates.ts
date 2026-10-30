import type { AppUpdater } from "electron-updater"

/** Where the installed app stands with its next version; `@pinai/domain/ports/app-updates.port` has the page's copy. */
export type AppUpdate = { kind: "none" } | { kind: "available"; version: string } | { kind: "ready"; version: string }

export interface AppUpdatesOptions {
    /** False on an unsigned Mac: Squirrel.Mac refuses an update not signed like the app. */
    canInstall: boolean
    openExternal(url: string): Promise<void>
    notify(update: AppUpdate): void
}

// electron-builder.yml's dmg.artifactName, in every release.
export const MAC_DOWNLOAD_URL = "https://github.com/Pina-i/pinai-client/releases/latest/download/Pinai.dmg"
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/** electron-updater over the GitHub releases: what the window's notice shows, and its two actions. */
export class AppUpdates {
    private readonly updater: AppUpdater
    private readonly options: AppUpdatesOptions
    private update: AppUpdate = { kind: "none" }

    constructor(updater: AppUpdater, options: AppUpdatesOptions) {
        this.updater = updater
        this.options = options
    }

    /** Checks now and every 6 hours; Windows and Linux download what it finds. */
    start(): void {
        const { canInstall } = this.options
        this.updater.autoDownload = canInstall
        this.updater.autoInstallOnAppQuit = canInstall
        this.updater.on("update-available", ({ version }) => {
            if (!canInstall) this.set({ kind: "available", version })
        })
        this.updater.on("update-downloaded", ({ version }) => this.set({ kind: "ready", version }))
        this.check()
        setInterval(() => this.check(), CHECK_EVERY_MS)
    }

    check(): void {
        // Offline, GitHub down, or a download cut short: the next check tries again.
        void this.updater.checkForUpdates().then(
            (found) => found?.downloadPromise?.catch(() => {}),
            () => {},
        )
    }

    current(): AppUpdate {
        return this.update
    }

    restart(): void {
        if (this.update.kind === "ready") this.updater.quitAndInstall()
    }

    async download(): Promise<void> {
        if (this.update.kind === "available") await this.options.openExternal(MAC_DOWNLOAD_URL)
    }

    private set(update: AppUpdate): void {
        this.update = update
        this.options.notify(update)
    }
}
