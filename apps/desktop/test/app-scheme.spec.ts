/** The `app://pinai` scheme: its privileges, and what it serves from the built renderer. */
import { mkdtempSync, writeFileSync } from "fs"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"

import { describe, expect, it, vi } from "vitest"

type Handler = (request: Request) => Promise<Response>

const electron = vi.hoisted(() => ({
    registerSchemesAsPrivileged: vi.fn<(schemes: unknown[]) => void>(),
    handle: vi.fn<(scheme: string, handler: Handler) => void>(),
    fetch: vi.fn<(url: string) => Promise<Response>>(),
}))

vi.mock("electron", () => ({
    net: { fetch: electron.fetch },
    protocol: { registerSchemesAsPrivileged: electron.registerSchemesAsPrivileged, handle: electron.handle },
}))

const { registerAppScheme, resolveAppFile, serveApp } = await import("../src/main/app-scheme")

describe("registerAppScheme", () => {
    // standard + secure are what make the origin, and its storage, the app's for good.
    it("registers app: with exactly the privileges the app needs", () => {
        registerAppScheme()
        expect(electron.registerSchemesAsPrivileged).toHaveBeenCalledOnce()
        expect(electron.registerSchemesAsPrivileged.mock.lastCall?.[0]).toEqual([
            { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
        ])
    })
})

describe("serveApp", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pinai-renderer-"))
    writeFileSync(path.join(root, "index.html"), "<!doctype html>")
    electron.fetch.mockImplementation(
        async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }),
    )
    serveApp(root)
    const [scheme, handler] = electron.handle.mock.lastCall!

    it("answers the app's routes with its index.html, never framed", async () => {
        expect(scheme).toBe("app")
        const response = await handler(new Request("app://pinai/home"))
        expect(electron.fetch).toHaveBeenCalledWith(pathToFileURL(path.join(root, "index.html")).href)
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("text/html")
        expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'")
    })

    it("answers another host with a 404, never framed either", async () => {
        const response = await handler(new Request("app://other/x"))
        expect(response.status).toBe(404)
        expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'")
    })
})

const ROOT = path.join(path.sep, "srv", "renderer")
const WASM = path.join(ROOT, "assets", "openmls_wasm_bg-C9o8qWlE.wasm")
const INDEX = path.join(ROOT, "index.html")
const SIBLING = path.join(path.sep, "srv", "renderer-old", "index.html")
const FILES = new Set([INDEX, WASM, SIBLING])
const resolve = (url: string) => resolveAppFile(url, ROOT, (file) => FILES.has(file))

describe("resolveAppFile", () => {
    it("serves a file of the build as it is", () => {
        expect(resolve("app://pinai/assets/openmls_wasm_bg-C9o8qWlE.wasm")).toBe(WASM)
        expect(resolve("app://pinai/assets/openmls_wasm_bg-C9o8qWlE.wasm?v=1")).toBe(WASM)
        expect(resolve("app://pinai/index.html")).toBe(INDEX)
    })

    it("answers every other path with index.html: the app's routes", () => {
        expect(resolve("app://pinai/")).toBe(INDEX)
        expect(resolve("app://pinai/callback?code=c&state=s")).toBe(INDEX)
        expect(resolve("app://pinai/dm/aaaa")).toBe(INDEX)
    })

    it("never serves a file out of the build", () => {
        expect(resolve("app://pinai/..%2frenderer-old%2findex.html")).toBeNull()
        expect(resolve("app://pinai/..%2f..%2fetc%2fpasswd")).toBeNull()
        expect(resolve("app://pinai/assets/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd")).toBeNull()
        // The URL parser already keeps these within the app's path: an app route.
        expect(resolve("app://pinai/%2e%2e/%2e%2e/etc/passwd")).toBe(INDEX)
        expect(resolve("app://pinai/%E0%A4%A")).toBeNull()
    })

    it("serves the app's host only", () => {
        expect(resolve("app://other/index.html")).toBeNull()
        expect(resolve("http://localhost:5173/index.html")).toBeNull()
    })
})
