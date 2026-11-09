/** The badge on the app's icon: what the page may ask, and what each system shows for it. */
import { EventEmitter } from "events"

import type { BrowserWindow, WebContents } from "electron"
import { describe, expect, it, vi } from "vitest"

const electron = vi.hoisted(() => ({
    setBadgeCount: vi.fn(() => true),
    createFromDataURL: vi.fn((url: string) => ({ url, isEmpty: () => url.endsWith(",") })),
}))
vi.mock("electron", () => ({
    app: { setBadgeCount: electron.setBadgeCount },
    nativeImage: { createFromDataURL: electron.createFromDataURL },
}))

const { AppBadge, MAX_BADGE_COUNT, NO_BADGE, badgeAction, badgeOf, clearWhenPageGoes, electronBadgeSurface } = await import(
    "../src/main/badge"
)
type BadgeSurface = import("../src/main/badge").BadgeSurface

const PNG = "data:image/png;base64,iVBORw0KGgo="

describe("badgeOf", () => {
    it("takes a non-negative integer, with the page's picture or none", () => {
        expect(badgeOf(3, PNG)).toEqual({ count: 3, image: PNG })
        expect(badgeOf(3, null)).toEqual({ count: 3, image: null })
        expect(badgeOf(0, null)).toEqual(NO_BADGE)
    })

    it("caps the count", () => {
        expect(badgeOf(MAX_BADGE_COUNT + 1, PNG)).toEqual({ count: MAX_BADGE_COUNT, image: PNG })
    })

    it("keeps no picture at zero", () => {
        expect(badgeOf(0, PNG)).toEqual(NO_BADGE)
    })

    it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [2 ** 53], ["3"], [null], [undefined], [{}]])(
        "refuses the count %s",
        (count) => {
            expect(badgeOf(count, null)).toBeNull()
        },
    )

    it.each([
        ["another type", "data:image/jpeg;base64,/9j/4AAQ"],
        ["an SVG", "data:image/svg+xml;base64,PHN2Zz4="],
        ["an address", "https://example.test/badge.png"],
        ["something after it", `${PNG}"onload=x`],
        ["one too large", `data:image/png;base64,${"A".repeat(16 * 1024)}`],
        ["not a string", { toString: (): string => PNG }],
        ["missing", undefined],
    ])("refuses a picture that is %s", (_what, image) => {
        expect(badgeOf(3, image)).toBeNull()
    })
})

describe("badgeAction", () => {
    it("counts on the Dock and on Linux's docks and taskbars", () => {
        expect(badgeAction("darwin", { count: 5, image: PNG })).toEqual({ kind: "count", count: 5 })
        expect(badgeAction("linux", { count: 120, image: PNG })).toEqual({ kind: "count", count: 120 })
        expect(badgeAction("linux", NO_BADGE)).toEqual({ kind: "count", count: 0 })
    })

    it("lays the page's picture over the taskbar button on Windows, 99+ past 99", () => {
        expect(badgeAction("win32", { count: 5, image: PNG })).toEqual({
            kind: "overlay",
            image: PNG,
            description: "5 unread",
        })
        expect(badgeAction("win32", { count: 120, image: PNG })).toMatchObject({ description: "99+ unread" })
    })

    it("clears Windows' overlay at zero, or without a picture", () => {
        const cleared = { kind: "overlay", image: null, description: "" }

        expect(badgeAction("win32", NO_BADGE)).toEqual(cleared)
        expect(badgeAction("win32", { count: 5, image: null })).toEqual(cleared)
    })

    it("does nothing elsewhere", () => {
        expect(badgeAction("freebsd", { count: 5, image: PNG })).toEqual({ kind: "none" })
    })
})

function surface(): BadgeSurface & { calls: unknown[][] } {
    const calls: unknown[][] = []
    return {
        calls,
        setBadgeCount: (count) => void calls.push(["count", count]),
        setOverlayIcon: (image, description) => void calls.push(["overlay", image, description]),
    }
}

describe("AppBadge", () => {
    it("shows a new count, and nothing again for the same one", () => {
        const icon = surface()
        const badge = new AppBadge("linux", icon)

        badge.show({ count: 2, image: PNG })
        badge.show({ count: 2, image: PNG })
        badge.show({ count: 3, image: PNG })

        expect(icon.calls).toEqual([
            ["count", 2],
            ["count", 3],
        ])
    })

    it("clears what it showed, once", () => {
        const icon = surface()
        const badge = new AppBadge("win32", icon)

        badge.clear()
        badge.show({ count: 1, image: PNG })
        badge.clear()
        badge.clear()

        expect(icon.calls).toEqual([
            ["overlay", PNG, "1 unread"],
            ["overlay", null, ""],
        ])
    })

    it("tells the tray each new count, not a new picture of the same one", () => {
        const counts: number[] = []
        const badge = new AppBadge("win32", surface(), (count) => counts.push(count))

        badge.show({ count: 2, image: PNG })
        badge.show({ count: 2, image: "data:image/png;base64,AAAA" })
        badge.show({ count: 120, image: PNG })
        badge.clear()

        expect(counts).toEqual([2, 120, 0])
    })

    it("lays Windows' overlay again for a window shown from the tray, and nothing at zero", () => {
        const icon = surface()
        const badge = new AppBadge("win32", icon)

        badge.repaint()
        badge.show({ count: 2, image: PNG })
        badge.repaint()

        expect(icon.calls).toEqual([
            ["overlay", PNG, "2 unread"],
            ["overlay", PNG, "2 unread"],
        ])
    })

    it("repaints nothing where the badge isn't the window's", () => {
        const icon = surface()
        const badge = new AppBadge("linux", icon)

        badge.show({ count: 2, image: null })
        badge.repaint()

        expect(icon.calls).toEqual([["count", 2]])
    })

    it("never throws: a system without a badge, or a window gone, stays the badge's problem", () => {
        const badge = new AppBadge("darwin", {
            setBadgeCount: () => {
                throw new Error("Object has been destroyed")
            },
            setOverlayIcon: () => {},
        })

        expect(() => badge.show({ count: 1, image: null })).not.toThrow()
    })
})

describe("clearWhenPageGoes", () => {
    it.each(["did-navigate", "render-process-gone"])("clears the badge on %s: the page that set it is gone", (event) => {
        const icon = surface()
        const badge = new AppBadge("linux", icon)
        const contents = new EventEmitter()
        clearWhenPageGoes(contents as unknown as WebContents, badge)
        badge.show({ count: 4, image: null })

        contents.emit(event)

        expect(icon.calls).toEqual([
            ["count", 4],
            ["count", 0],
        ])
    })
})

describe("electronBadgeSurface", () => {
    it("sets the app's badge count", () => {
        electronBadgeSurface(() => null).setBadgeCount(4)

        expect(electron.setBadgeCount).toHaveBeenCalledWith(4)
    })

    it("lays the picture over the window's taskbar button, and clears it", () => {
        const setOverlayIcon = vi.fn()
        const window = { setOverlayIcon } as unknown as BrowserWindow
        const icon = electronBadgeSurface(() => window)

        icon.setOverlayIcon(PNG, "4 unread")
        icon.setOverlayIcon(null, "")
        icon.setOverlayIcon("data:image/png;base64,", "4 unread")

        expect(setOverlayIcon.mock.calls).toEqual([
            [expect.objectContaining({ url: PNG }), "4 unread"],
            [null, ""],
            [null, "4 unread"],
        ])
    })

    it("does nothing without a window", () => {
        expect(() => electronBadgeSurface(() => null).setOverlayIcon(PNG, "4 unread")).not.toThrow()
    })
})
