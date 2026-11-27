import { describe, expect, it } from "vitest"

import { listensForShare, offersStartOver, offersWayIn, openingTab, shareRefused, shownTab } from "@pinai/domain/models/restore-page"

const page = { lacksWords: true, settingUp: false, failed: false, startingOver: false, showingNewWords: false }

describe("the new-device and reset page's rules", () => {
    it("offers another device's code and the words, except on a reset no start over explains", () => {
        expect(offersWayIn("new-device", null)).toBe(true)
        expect(offersWayIn("reset", "newer-generation")).toBe(true)
        expect(offersWayIn("reset", "unknown-change")).toBe(false)
        expect(offersWayIn("reset", null)).toBe(false)
    })

    it("offers start over to a device that isn't in, and shows such a device no Start over tab", () => {
        expect(offersStartOver(false)).toBe(true)
        expect(offersStartOver(true)).toBe(false)
        expect(shownTab("start-over", true)).toBe("device")
        expect(shownTab("start-over", false)).toBe("start-over")
        expect(shownTab("words", true)).toBe("words")
    })

    it("listens for the share only once set up, lacking the words, while no start over or new words hold the page", () => {
        expect(listensForShare(page)).toBe(true)
        expect(listensForShare({ ...page, lacksWords: false })).toBe(false)
        expect(listensForShare({ ...page, settingUp: true })).toBe(false)
        expect(listensForShare({ ...page, failed: true })).toBe(false)
        expect(listensForShare({ ...page, startingOver: true })).toBe(false)
        expect(listensForShare({ ...page, showingNewWords: true })).toBe(false)
    })

    it("opens on Start over for a request of this device's waiting, matured, cancelled or superseded", () => {
        for (const kind of ["waiting", "ready", "cancelled", "superseded"] as const) expect(openingTab(kind)).toBe("start-over")
        for (const kind of ["choice", "elsewhere", "approved", null] as const) expect(openingTab(kind)).toBeNull()
    })

    it("says a share refused only when no approval here explains it", () => {
        expect(shareRefused({ kind: "unusable" }, false)).toBe(true)
        expect(shareRefused({ kind: "unusable" }, true)).toBe(false)
        expect(shareRefused({ kind: "waiting" }, false)).toBe(false)
        expect(shareRefused(null, false)).toBe(false)
    })
})
