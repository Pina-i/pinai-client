import path from "path"

import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import type { HeldRefreshToken } from "@pinai/domain/ports/auth.port"
import { app, BrowserWindow, type IpcMainInvokeEvent, ipcMain, shell } from "electron"

import { SCHEME, callbackPath, linkIn } from "./deep-link"
import { KeychainSessionTokenStore, MainSession, keychain } from "./session"

// One app at a time: a deep link launches a second instance, which hands it to the first and quits.
if (!app.requestSingleInstanceLock()) app.quit()
else start()

function start(): void {
    let window: BrowserWindow | null = null
    // A link that arrived before the window: Windows and Linux pass it to a cold start's argv.
    let pending = linkIn(process.argv)

    const deliver = (link: string) => {
        const to = callbackPath(link)
        if (!to) return
        if (!window) {
            pending = link
            return
        }
        void window.loadURL(new URL(to, rendererUrl()).href)
        if (window.isMinimized()) window.restore()
        window.focus()
    }

    app.on("second-instance", (_event, argv) => {
        const link = linkIn(argv)
        if (link) deliver(link)
        else window?.focus()
    })
    // macOS hands the link to the running app, before `ready` on a cold start.
    app.on("open-url", (event, link) => {
        event.preventDefault()
        deliver(link)
    })
    // Linux in development is registered by `scripts/register-scheme.mjs`; a packaged app's
    // installer declares the scheme.
    if (process.defaultApp && process.platform !== "linux") {
        app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])])
    }

    void app.whenReady().then(() => {
        const session = new MainSession(
            new KeychainSessionTokenStore(path.join(app.getPath("userData"), "session"), keychain),
            new OidcAdapter(),
        )
        handle("session:hold", (held: HeldRefreshToken) => session.hold(checked(held)))
        handle("session:renew", () => session.renew())
        handle("session:sign-out", () => session.signOut())
        handle("open-external", (url: string) => {
            if (typeof url === "string" && /^https?:\/\//.test(url)) return shell.openExternal(url)
        })

        window = createWindow()
        window.on("closed", () => {
            window = null
        })
        if (pending) deliver(pending)
        pending = null
        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) window = createWindow()
        })
    })

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit()
    })
}

function rendererUrl(): string {
    const url = process.env.ELECTRON_RENDERER_URL
    // A packaged renderer needs a privileged scheme of its own first.
    if (!url) throw new Error("Only `electron-vite dev` is supported for now")
    return url
}

function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: { preload: path.join(import.meta.dirname, "../preload/index.cjs") },
    })
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) void shell.openExternal(url)
        return { action: "deny" }
    })
    void window.loadURL(rendererUrl())
    return window
}

/** An IPC handler answering the app's own pages only. */
function handle<A extends unknown[], R>(channel: string, run: (...args: A) => R): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        const from = event.senderFrame?.url
        if (!from || new URL(from).origin !== new URL(rendererUrl()).origin) {
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
