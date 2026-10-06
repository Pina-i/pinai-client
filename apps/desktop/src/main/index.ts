import { app, BrowserWindow, shell } from "electron"

const rendererUrl = process.env.ELECTRON_RENDERER_URL

// A packaged renderer needs a privileged scheme and the deep-link sign-in (a desktop OAuth client) first.
if (!rendererUrl) throw new Error("Only `electron-vite dev` is supported for now")

function createWindow(url: string): void {
    const window = new BrowserWindow({ width: 1280, height: 800 })

    window.webContents.setWindowOpenHandler(({ url: target }) => {
        if (/^https?:\/\//.test(target)) void shell.openExternal(target)
        return { action: "deny" }
    })

    void window.loadURL(url)
}

app.whenReady().then(() => {
    createWindow(rendererUrl)
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(rendererUrl)
    })
})

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
})
