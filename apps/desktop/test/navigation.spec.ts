/** Where the desktop app's window may go while it signs in, in its own window. */
import { describe, expect, it } from "vitest"

import { APP_URL, isApp, route } from "../src/main/navigation"

const APP = "http://localhost:5173"
const IDP = "https://aotearoa.nz"

describe("route", () => {
    it("lets the app's own pages and the IdP being signed in to load", () => {
        expect(route(`${APP}/home`, APP, null)).toEqual({ kind: "allow" })
        expect(route(`${IDP}/login?client_id=x`, APP, IDP)).toEqual({ kind: "allow" })
    })

    it("turns the IdP's answer into the app's /callback, whatever it says", () => {
        expect(route("io.github.pina-i:/callback?code=c&state=s", APP, IDP)).toEqual({
            kind: "callback",
            path: "/callback?code=c&state=s",
        })
        expect(route("io.github.pina-i:/callback?error=access_denied&state=s", APP, IDP)).toEqual({
            kind: "callback",
            path: "/callback?error=access_denied&state=s",
        })
    })

    it("keeps everything else out: another site, an IdP not signed in to, another path of the scheme", () => {
        expect(route("https://evil.example/", APP, IDP)).toEqual({ kind: "deny" })
        expect(route(`${IDP}/login`, APP, null)).toEqual({ kind: "deny" })
        expect(route("io.github.pina-i:/elsewhere", APP, IDP)).toEqual({ kind: "deny" })
        expect(route("not a url", APP, IDP)).toEqual({ kind: "deny" })
    })
})

describe("isApp", () => {
    it("knows the built app by its scheme and host, whatever the host's case", () => {
        expect(isApp("app://pinai/", APP_URL)).toBe(true)
        expect(isApp("app://pinai/dm/aaaa?x=1", APP_URL)).toBe(true)
        expect(isApp("app://PINAI/home", APP_URL)).toBe(true)
    })

    it("knows the dev server's pages by its scheme, host and port", () => {
        expect(isApp(`${APP}/home`, APP)).toBe(true)
        expect(isApp("http://localhost:5174/home", APP)).toBe(false)
        expect(isApp("https://localhost:5173/home", APP)).toBe(false)
        expect(isApp("http://localhost:5173@evil.example/", APP)).toBe(false)
        expect(isApp("http://localhost:51730/home", APP)).toBe(false)
    })

    // Node gives most of these, and app://pinai itself, the origin "null".
    it("refuses every other scheme or host", () => {
        for (const url of [
            "data:text/html,<p>x</p>",
            "about:blank",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "blob:app://pinai/0f1e2d3c",
            "app://other/",
            "app://evil\\@pinai/",
            "app://someone@pinai/",
            "not a url",
        ]) {
            expect(isApp(url, APP_URL), url).toBe(false)
        }
    })
})

describe("route, in the built app", () => {
    it("lets its pages load and keeps data:, about: and other hosts out", () => {
        expect(route("app://pinai/home", APP_URL, null)).toEqual({ kind: "allow" })
        expect(route("data:text/html,<p>x</p>", APP_URL, null)).toEqual({ kind: "deny" })
        expect(route("about:blank", APP_URL, null)).toEqual({ kind: "deny" })
        expect(route("app://other/", APP_URL, null)).toEqual({ kind: "deny" })
    })

    it("turns the IdP's answer into the app's /callback, at the app's address", () => {
        expect(route("io.github.pina-i:/callback?code=c&state=s", APP_URL, IDP)).toEqual({
            kind: "callback",
            path: "/callback?code=c&state=s",
        })
        expect(new URL("/callback?code=c&state=s", APP_URL).href).toBe("app://pinai/callback?code=c&state=s")
    })
})
