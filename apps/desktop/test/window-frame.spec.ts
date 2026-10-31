import { describe, expect, it } from "vitest"

import { DEFAULT_TITLE_BAR, TITLE_BAR_HEIGHT, frameOptions, titleBarColors } from "../src/main/window-frame"

describe("titleBarColors", () => {
    it("takes the page's two hex colours", () => {
        expect(titleBarColors({ background: "#040C0C", symbols: "#869292" })).toEqual({
            background: "#040C0C",
            symbols: "#869292",
        })
    })

    it("refuses anything else: another notation, a missing colour, not an object", () => {
        expect(titleBarColors({ background: "oklch(0.145 0.014 196)", symbols: "#869292" })).toBeNull()
        expect(titleBarColors({ background: "#040c0c" })).toBeNull()
        expect(titleBarColors({ background: "#040c0c80", symbols: "#869292" })).toBeNull()
        expect(titleBarColors("#040c0c")).toBeNull()
        expect(titleBarColors(null)).toBeNull()
    })
})

describe("frameOptions", () => {
    it("hides the system's bar and colours the overlay's buttons like the page", () => {
        expect(frameOptions("win32", DEFAULT_TITLE_BAR)).toEqual({
            titleBarStyle: "hidden",
            titleBarOverlay: { height: TITLE_BAR_HEIGHT, color: "#040c0c", symbolColor: "#869292" },
            backgroundColor: "#040c0c",
        })
        expect(frameOptions("linux", DEFAULT_TITLE_BAR).titleBarOverlay).toMatchObject({ color: "#040c0c" })
    })

    it("keeps the traffic lights on macOS, centred on the bar", () => {
        expect(frameOptions("darwin", DEFAULT_TITLE_BAR)).toEqual({
            titleBarStyle: "hidden",
            titleBarOverlay: { height: TITLE_BAR_HEIGHT },
            trafficLightPosition: { x: 14, y: 10 },
            backgroundColor: "#040c0c",
        })
    })
})
