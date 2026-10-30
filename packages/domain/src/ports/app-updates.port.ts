/** Where the installed app stands with its next version. */
export type AppUpdate =
    | { kind: "none" }
    /** Found, not downloaded: an unsigned Mac can't install it itself. */
    | { kind: "available"; version: string }
    /** Downloaded: a restart installs it. */
    | { kind: "ready"; version: string }

/** The desktop app's own updates; the web app's is a reload. */
export interface IAppUpdatesPort {
    status(): Promise<AppUpdate>
    /** Returns the unsubscribe. */
    onChange(listener: (update: AppUpdate) => void): () => void
    restart(): Promise<void>
    download(): Promise<void>
}
