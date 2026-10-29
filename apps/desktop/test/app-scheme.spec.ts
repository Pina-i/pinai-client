/** What `app://pinai/<path>` serves from the built renderer. */
import path from "path"

import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({ net: {}, protocol: {} }))

const { resolveAppFile } = await import("../src/main/app-scheme")

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
