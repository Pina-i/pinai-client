import path from "path"

import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import type { HeldRefreshToken } from "@pinai/domain/ports/auth.port"
import { app, BrowserWindow, type IpcMainInvokeEvent, ipcMain, powerMonitor, shell } from "electron"
import electronUpdater from "electron-updater"

import { registerAppScheme, serveApp } from "./app-scheme"
import { APP_URL, appUrlFor, isApp, route } from "./navigation"
import { KeychainSessionTokenStore, MainSession, keychain } from "./session"
import { refusesToStart } from "./startup"
import { AppUpdates } from "./updates"

if (refusesToStart(app.isPackaged, (name) => app.commandLine.hasSwitch(name))) app.exit(1)
// One app at a time: a second launch focuses the first.
else if (!app.requestSingleInstanceLock()) app.quit()
else start()

function start(): void {
    registerAppScheme()
    let window: BrowserWindow | null = null
    // The IdP whose pages the window shows, from the sign-in the app started until its answer.
    let signingInTo: string | null = null

    app.on("second-instance", () => {
        if (window?.isMinimized()) window.restore()
        window?.focus()
    })

    void app.whenReady().then(() => {
        // Built: electron-vite's renderer output, beside out/main.
        if (appUrl() === APP_URL) serveApp(path.join(import.meta.dirname, "../renderer"))
        const session = new MainSession(
            new KeychainSessionTokenStore(path.join(app.getPath("userData"), "session"), keychain),
            new OidcAdapter(),
        )
        handle("session:hold", (held: HeldRefreshToken) => session.hold(checked(held)))
        handle("session:renew", () => session.renew())
        handle("session:sign-out", () => session.signOut())
        // The IdP's sign-in pages, in this window, as the web app shows them in its tab.
        handle("sign-in", (url: string) => {
            if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error("Not a sign-in page")
            signingInTo = new URL(url).origin
            return window?.loadURL(url)
        })

        const updates = new AppUpdates(electronUpdater.autoUpdater, {
            canInstall: process.platform !== "darwin",
            openExternal: (url) => shell.openExternal(url),
            // The IdP's pages may be showing: their preload never listens.
            notify: (update) => window?.webContents.send("updates:changed", update),
        })
        if (app.isPackaged) {
            updates.start()
            // Timers stop while the device sleeps; a minute for the network to come back.
            powerMonitor.on("resume", () => setTimeout(() => updates.check(), 60_000))
        }
        handle("updates:status", () => updates.current())
        handle("updates:restart", () => updates.restart())
        handle("updates:download", () => updates.download())

        window = createWindow((to) => {
            const next = route(to, appUrl(), signingInTo)
            if (next.kind === "callback") {
                signingInTo = null
                void window?.loadURL(new URL(next.path, appUrl()).href)
            }
            return next.kind === "allow"
        })
        window.on("closed", () => {
            window = null
        })
    })

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit()
    })
}

function appUrl(): string {
    return appUrlFor(app.isPackaged, process.env.ELECTRON_RENDERER_URL)
}

/** The window, held to `navigable`: what it says no to doesn't load. */
function createWindow(navigable: (url: string) => boolean): BrowserWindow {
    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            // Packaged, no console on the app's page: it holds the tokens and the keys.
            devTools: !app.isPackaged,
            preload: path.join(import.meta.dirname, "../preload/index.cjs"),
            // The preload exposes the bridge to the app's own pages only, never the IdP's.
            additionalArguments: [`--pinai-app=${appUrl()}`],
        },
    })
    const guard = (event: Electron.Event, url: string) => {
        if (!navigable(url)) event.preventDefault()
    }
    // A link, a form, a script — and the IdP's redirect to the desktop callback.
    window.webContents.on("will-navigate", guard)
    window.webContents.on("will-redirect", guard)
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) void shell.openExternal(url)
        return { action: "deny" }
    })
    void window.loadURL(appUrl())
    return window
}

/** An IPC handler answering the app's own pages only. */
function handle<A extends unknown[], R>(channel: string, run: (...args: A) => R): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        const from = event.senderFrame?.url
        if (!from || !isApp(from, appUrl())) {
            throw new Error(`${channel} refused to ${from ?? "a gone frame"}`)
        }
        return run(...(args as A))
    })
}

function checked(held: HeldRefreshToken): HeldRefreshToken {
    const url = (value: unknown) => typeof value === "string" && /^https?:\/\//.test(value)
    const fine =
        typeof held?.refreshToken === "string" &&
        url(held.tokenEndpoint) &&
        url(held.clientId) &&
        (held.revocationEndpoint === null || url(held.revocationEndpoint))
    if (!fine) throw new Error("Not a refresh token to hold")
    return held
}
