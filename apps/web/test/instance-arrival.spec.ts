/**
 * Arriving on `/?instance=<domain>`, where an invitation's sign-up and a reset link send people:
 * the landing with the instance filled in, never a sign-in by itself; the app itself when it signs
 * in there already; and another instance's session dropped first, on this device only.
 */
import { describe, expect, it, vi } from "vitest"

import { instanceArrival, sameInstance } from "@pinai/domain/models/instance"
import type { AuthPlatform, ISessionTokenStore } from "@pinai/domain/ports/auth.port"
import { arriveAtInstanceUseCase } from "@pinai/domain/usecases/auth/arrive-at-instance.usecase"

const AOTEAROA = { origin: "https://aotearoa.nz", host: "aotearoa.nz" }
const LOCAL = { origin: "http://localhost:8080", host: "localhost:8080" }

describe("instanceArrival", () => {
    it("fills the landing in when the app signs in nowhere", () => {
        expect(instanceArrival("aotearoa.nz", null)).toEqual({ kind: "pick", address: AOTEAROA, leaving: false })
        expect(instanceArrival("localhost:8080", null)).toEqual({ kind: "pick", address: LOCAL, leaving: false })
    })

    it("goes on to the app when it signs in to that instance already, however either is written", () => {
        expect(instanceArrival("aotearoa.nz", "https://aotearoa.nz")).toEqual({ kind: "here" })
        expect(instanceArrival("Aotearoa.NZ", "https://aotearoa.nz/")).toEqual({ kind: "here" })
        expect(instanceArrival("localhost:8080", "http://localhost:8080")).toEqual({ kind: "here" })
        expect(instanceArrival("http://aotearoa.nz", "https://aotearoa.nz")).toEqual({ kind: "here" })
    })

    it("leaves another instance: another host or port", () => {
        for (const signedInTo of ["https://reef.chat", "http://localhost:8081", "https://aotearoa.nz:8443", "not an address"]) {
            expect(instanceArrival("aotearoa.nz", signedInTo), signedInTo).toEqual({
                kind: "pick",
                address: AOTEAROA,
                leaving: true,
            })
        }
    })

    it("ignores what can't be an instance, signed in or not", () => {
        for (const asked of ["", "aotearoa", "javascript:alert(1)", "ftp://aotearoa.nz", "https://user:pw@aotearoa.nz"]) {
            expect(instanceArrival(asked, null), asked).toEqual({ kind: "none" })
            expect(instanceArrival(asked, "https://reef.chat"), asked).toEqual({ kind: "none" })
        }
        expect(instanceArrival(null, "https://reef.chat")).toEqual({ kind: "none" })
    })
})

describe("sameInstance", () => {
    it("is one authority, host and port, whatever the scheme or case", () => {
        expect(sameInstance(AOTEAROA, "http://Aotearoa.nz/")).toBe(true)
        expect(sameInstance(LOCAL, "localhost:8080")).toBe(true)
        expect(sameInstance(LOCAL, "localhost:8081")).toBe(false)
        expect(sameInstance(AOTEAROA, "nonsense")).toBe(false)
    })
})

describe("arriveAtInstanceUseCase", () => {
    function platform(browserSession = true) {
        const clear = vi.fn()
        const tokens: ISessionTokenStore = { set: vi.fn(), take: vi.fn(() => null), clear }
        return { platform: { browserSession, tokens } as unknown as AuthPlatform, clear }
    }

    it("drops another instance's session on this device, then fills the landing in", () => {
        const { platform: web, clear } = platform()
        const dropSession = vi.fn()

        const arrival = arriveAtInstanceUseCase("aotearoa.nz", "https://reef.chat", dropSession, web)

        expect(arrival).toEqual({ kind: "pick", address: AOTEAROA, leaving: true })
        expect(clear).toHaveBeenCalledOnce()
        expect(dropSession).toHaveBeenCalledOnce()
    })

    it("keeps the session for the instance it signs in to, and has nothing to drop when it signs in nowhere", () => {
        for (const signedInTo of ["https://aotearoa.nz", null]) {
            const { platform: web, clear } = platform()
            const dropSession = vi.fn()

            arriveAtInstanceUseCase("aotearoa.nz", signedInTo, dropSession, web)

            expect(clear).not.toHaveBeenCalled()
            expect(dropSession).not.toHaveBeenCalled()
        }
    })

    it("drops nothing for an address that is none", () => {
        const { platform: web, clear } = platform()
        const dropSession = vi.fn()

        expect(arriveAtInstanceUseCase("nonsense", "https://reef.chat", dropSession, web)).toEqual({ kind: "none" })
        expect(clear).not.toHaveBeenCalled()
        expect(dropSession).not.toHaveBeenCalled()
    })

    it("is ignored by an app holding a session of its own, which no link opens", () => {
        const { platform: desktop, clear } = platform(false)
        const dropSession = vi.fn()

        expect(arriveAtInstanceUseCase("aotearoa.nz", "https://reef.chat", dropSession, desktop)).toEqual({
            kind: "none",
        })
        expect(clear).not.toHaveBeenCalled()
        expect(dropSession).not.toHaveBeenCalled()
    })
})
