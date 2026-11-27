import { describe, expect, it } from "vitest"
import { arrivalLine, askingLine } from "../src/presentation/organisms/device-way/device-way-wording"

const at = () => "14:05"

describe("askingLine", () => {
    it("says what the request is doing, nothing while the code just waits", () => {
        expect(askingLine({ kind: "starting" }, at)).toBe("Asking your instance for a code…")
        const showing = { kind: "showing", code: "482913", deadline: 0, answered: false, failure: null } as const
        expect(askingLine({ ...showing, phase: "ready" }, at)).toBeNull()
        expect(askingLine({ ...showing, phase: "confirming", answered: true }, at)).toBe("Your other device is checking the code…")
        expect(askingLine({ kind: "paused" }, at)).toBeNull()
    })

    it("words a code that went otherwise, and the hour's limit by the time of the next", () => {
        expect(askingLine({ kind: "stopped", failure: "wrong-code" }, at)).toBe("That code didn't match on your other device.")
        expect(askingLine({ kind: "stopped", failure: "cancelled" }, at)).toBe("That request ended without approving this device.")
        expect(askingLine({ kind: "waiting", until: 0, why: "limit", failure: null }, at)).toBe("Too many codes asked for this hour. A new one at 14:05.")
        expect(askingLine({ kind: "waiting", until: 0, why: "unreachable", failure: null }, at)).toBe("Couldn't reach your instance. Trying again…")
    })
})

describe("arrivalLine", () => {
    it("opens the app once approved, nothing restored on the phone", () => {
        expect(arrivalLine({ kind: "entering", waiting: false }, null)).toBe("Approved — opening Pīna'i…")
        expect(arrivalLine({ kind: "in" }, { kind: "kept" })).toBe("Approved — opening Pīna'i…")
    })

    it("says when the other device is slow, the instance refused, or the share can't be used", () => {
        expect(arrivalLine({ kind: "entering", waiting: true }, { kind: "waiting" })).toMatch(/^Approved\. Waiting for your other device/)
        expect(arrivalLine({ kind: "refused", error: new Error("no") }, null)).toBe("Your instance refused to let this device in.")
        expect(arrivalLine({ kind: "in" }, { kind: "unusable", reason: "signature" } as never)).toMatch(/Type your 24 words/)
    })
})
