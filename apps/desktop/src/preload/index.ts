/// <reference lib="dom" />

import { contextBridge, ipcRenderer } from "electron"

import { isApp } from "../main/navigation"

// `window.pinaiDesktop`, as `apps/web/src/adapters/desktop/desktop-bridge.ts` reads it — for the
// app's own pages only: the IdP's sign-in pages load in the same window, and never see it. The
// page hands the refresh token over once and never gets it back.
const FLAG = "--pinai-app="
const app = process.argv.find((arg) => arg.startsWith(FLAG))?.slice(FLAG.length)

if (app && isApp(window.location.href, app)) {
    contextBridge.exposeInMainWorld("pinaiDesktop", {
        session: {
            store: (held: unknown) => ipcRenderer.invoke("session:hold", held),
            renew: () => ipcRenderer.invoke("session:renew"),
            clear: () => ipcRenderer.invoke("session:sign-out"),
        },
        signIn: (url: string) => ipcRenderer.invoke("sign-in", url),
        updates: {
            status: () => ipcRenderer.invoke("updates:status"),
            onChange: (listener: (update: unknown) => void) => {
                const forward = (_event: Electron.IpcRendererEvent, update: unknown) => listener(update)
                ipcRenderer.on("updates:changed", forward)
                return () => void ipcRenderer.removeListener("updates:changed", forward)
            },
            restart: () => ipcRenderer.invoke("updates:restart"),
            download: () => ipcRenderer.invoke("updates:download"),
        },
    })
}
