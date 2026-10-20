import { contextBridge, ipcRenderer } from "electron"

// `window.pinaiDesktop`, as `apps/web/src/adapters/desktop/desktop-bridge.ts` reads it. The page
// hands the refresh token over once and never gets it back.
contextBridge.exposeInMainWorld("pinaiDesktop", {
    session: {
        store: (held: unknown) => ipcRenderer.invoke("session:hold", held),
        renew: () => ipcRenderer.invoke("session:renew"),
        clear: () => ipcRenderer.invoke("session:sign-out"),
    },
    openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
})
