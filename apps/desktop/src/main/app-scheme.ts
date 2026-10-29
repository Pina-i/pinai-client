import { statSync } from "fs"
import path from "path"
import { pathToFileURL } from "url"

import { net, protocol } from "electron"

import { APP_URL, isApp } from "./navigation"

const APP_SCHEME = new URL(APP_URL).protocol.slice(0, -1)

/**
 * Before `app.whenReady()`: what makes `app://pinai` an origin as an `https:` one is — an origin of
 * its own for the app's storage, a secure context for WebCrypto, `fetch` for the WASM engine.
 */
export function registerAppScheme(): void {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: APP_SCHEME,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true,
                codeCache: true,
            },
        },
    ])
}

/** Serves `root`, the built renderer, at `app://pinai/`. */
export function serveApp(root: string): void {
    protocol.handle(APP_SCHEME, async (request) => {
        const file = resolveAppFile(request.url, root, isFile)
        if (!file) return new Response(null, { status: 404 })
        const response = await net.fetch(pathToFileURL(file).href)
        // Any instance's sign-in pages load in this window: none may frame the app, which a meta CSP can't say.
        const headers = new Headers(response.headers)
        headers.set("Content-Security-Policy", "frame-ancestors 'none'")
        return new Response(response.body, { status: response.status, headers })
    })
}

// A path stat refuses (a NUL byte, a name too long, no access) is no file: an app route.
function isFile(file: string): boolean {
    try {
        return statSync(file, { throwIfNoEntry: false })?.isFile() === true
    } catch {
        return false
    }
}

/**
 * The file in `root` that `url` names, else `index.html`: every other path is one of the app's
 * routes, as Caddy's `try_files` has it. `null` for another host, or a path out of `root`.
 */
export function resolveAppFile(url: string, root: string, isFile: (file: string) => boolean): string | null {
    if (!isApp(url, APP_URL)) return null
    let pathname: string
    try {
        pathname = decodeURIComponent(new URL(url).pathname)
    } catch {
        return null
    }
    const file = path.join(root, pathname)
    if (file !== root && !file.startsWith(root + path.sep)) return null
    return isFile(file) ? file : path.join(root, "index.html")
}
