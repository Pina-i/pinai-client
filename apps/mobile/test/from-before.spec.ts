import { describe, expect, it } from "vitest"
import { fromBeforeLine } from "../src/presentation/pages/onboarding/setup/from-before"

describe("fromBeforeLine", () => {
    it("names the device a start over left behind, and how it comes back with the new words", () => {
        expect(fromBeforeLine({ cause: "start-over", labels: ["Firefox on Linux"] })).toBe(
            `Your device from before (Firefox on Linux) is no longer approved. If you still have it, open Pīna'i on it, choose "It was me" if it shows a banner, then type these words there. If you've lost it, sign it out in Settings → Devices on the web or the desktop app: a device you've lost still shows your conversations until you sign it out.`
        )
    })

    it("speaks of several, and of a replacement's", () => {
        const line = fromBeforeLine({ cause: "replacement", labels: ["Firefox on Linux", "Pixel 9"] })
        expect(line).toMatch(/^Your other devices \(Firefox on Linux, Pixel 9\) need the new words\. If you still have one,/)
        expect(line).toContain("If you've lost one,")
    })
})
