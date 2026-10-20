/// <reference lib="dom" />

import { contextBridge, ipcRenderer } from "electron"

// `window.pinaiDesktop`, as `apps/web/src/adapters/desktop/desktop-bridge.ts` reads it — for the
// app's own pages only: the IdP's sign-in pages load in the same window, and never see it. The
// page hands the refresh token over once and never gets it back.
const appOrigin = process.argv.find((arg) => arg.startsWith("--pinai-app-origin="))?.split("=")[1]

if (appOrigin && window.location.origin === appOrigin) {
    contextBridge.exposeInMainWorld("pinaiDesktop", {
        session: {
            store: (held: unknown) => ipcRenderer.invoke("session:hold", held),
            renew: () => ipcRenderer.invoke("session:renew"),
            clear: () => ipcRenderer.invoke("session:sign-out"),
        },
        signIn: (url: string) => ipcRenderer.invoke("sign-in", url),
    })
}
