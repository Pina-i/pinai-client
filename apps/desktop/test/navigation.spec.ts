/** Where the desktop app's window may go while it signs in, in its own window. */
import { describe, expect, it } from "vitest"

import { route } from "../src/main/navigation"

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
