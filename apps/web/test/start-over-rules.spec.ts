import { describe, expect, it } from "vitest"

import {
    endedNote,
    matureRereadDelay,
    readyAtOnce,
    sightStartOver,
    startOverStage,
    type AskingState,
    type StartOverRequest,
} from "@pinai/domain/models/start-over"

const request = (id: string, over: Partial<StartOverRequest> = {}): StartOverRequest =>
    ({ id, deviceId: "phone", displayName: "", createdAt: 1_000, readyAt: 9_000, ended: null, ...over }) as StartOverRequest
const waiting: AskingState = { kind: "waiting", request: request("r1") }

describe("the start over panel's rules", () => {
    it("shows the choice until it may ask, a loader until read, the request's state once read, and waiting while held", () => {
        expect(startOverStage({ mayAsk: false, state: waiting, readFailed: false, held: false })).toBe("choice")
        expect(startOverStage({ mayAsk: true, state: null, readFailed: false, held: false })).toBe("loading")
        expect(startOverStage({ mayAsk: true, state: null, readFailed: true, held: false })).toBe("choice")
        expect(startOverStage({ mayAsk: true, state: { kind: "ready", request: request("r1") }, readFailed: false, held: true })).toBe("waiting")
        expect(startOverStage({ mayAsk: true, state: { kind: "elsewhere" }, readFailed: false, held: false })).toBe("elsewhere")
        expect(startOverStage({ mayAsk: true, state: { kind: "cancelled", request: request("r1") }, readFailed: false, held: false })).toBe("choice")
    })

    it("says a request ready from the start: no approved device to wait for", () => {
        expect(readyAtOnce({ kind: "ready", request: request("r1", { readyAt: 1_000 }) })).toBe(true)
        expect(readyAtOnce({ kind: "ready", request: request("r1") })).toBe(false)
        expect(readyAtOnce(waiting)).toBe(false)
        expect(readyAtOnce(null)).toBe(false)
    })

    it("says how the last request ended: cancelled, or superseded unless the holder was told", () => {
        expect(endedNote({ kind: "cancelled", request: request("r1") }, null)).toBe("cancelled")
        expect(endedNote({ kind: "superseded", request: request("r1") }, null)).toBe("superseded")
        expect(endedNote({ kind: "superseded", request: request("r1") }, "superseded")).toBeNull()
        expect(endedNote(waiting, null)).toBeNull()
    })

    it("tells once of a request seen open here that was then approved or superseded — never of one only read ended", () => {
        let seen = { open: null as string | null, told: null as string | null }
        const step = (state: AskingState | null) => {
            const sighted = sightStartOver(seen, state)
            seen = sighted.seen
            return sighted.tell
        }
        expect(step({ kind: "approved", request: request("r0") })).toBeNull()
        expect(step(waiting)).toBeNull()
        expect(step({ kind: "approved", request: request("r1") })).toBe("approved")
        expect(step({ kind: "approved", request: request("r1") })).toBe("approved")
        expect(seen).toEqual({ open: "r1", told: "r1" })
    })

    it("reads a waiting request again a second after it matures, within what a timer takes", () => {
        expect(matureRereadDelay(9_000, 4_000)).toBe(6_000)
        expect(matureRereadDelay(9_000, 20_000)).toBe(1_000)
        expect(matureRereadDelay(Number.MAX_SAFE_INTEGER, 0)).toBe(2 ** 31 - 1)
    })
})
