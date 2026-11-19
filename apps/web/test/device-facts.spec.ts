/**
 * The browser's facts for its name (`BrowserDeviceFactsAdapter`): the `User-Agent` at once,
 * Chromium's hints only when they come in time, the base name otherwise.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { BrowserDeviceFactsAdapter, HINTS_TIMEOUT_MS, type NavigatorFacts } from "@/adapters/device/device-facts-browser.adapter"
import { DesktopDeviceFactsAdapter } from "@/adapters/desktop/device-facts-desktop.adapter"
import type { DesktopBridge } from "@/adapters/desktop/desktop-bridge"
import { composeDeviceLabel } from "@pinai/domain/models/device-label"

const ANDROID =
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0"

function chromium(getHighEntropyValues: (hints: string[]) => Promise<Record<string, unknown>>): NavigatorFacts {
    return { userAgent: ANDROID, userAgentData: { mobile: true, getHighEntropyValues: vi.fn(getHighEntropyValues) } }
}

describe("BrowserDeviceFactsAdapter", () => {
    afterEach(() => vi.useRealTimers())

    it("knows the User-Agent at once, without the hints", () => {
        const adapter = new BrowserDeviceFactsAdapter(chromium(async () => ({ model: "Pixel 8" })))

        expect(adapter.known()).toEqual({ client: "browser", userAgent: ANDROID, hints: null })
    })

    it("asks Chromium for the model and the platform version", async () => {
        const navigator = chromium(async () => ({ mobile: true, model: "Pixel 8", platformVersion: "14.0.0" }))

        const { facts, late } = await new BrowserDeviceFactsAdapter(navigator).gather()

        expect(navigator.userAgentData!.getHighEntropyValues).toHaveBeenCalledWith(["model", "platformVersion"])
        expect(facts.hints).toEqual({ mobile: true, model: "Pixel 8", platformVersion: "14.0.0" })
        expect(late).toBe(false)
        expect(composeDeviceLabel(facts)).toEqual({ name: "Chrome on Pixel 8", kind: "phone", client: "browser" })
    })

    it("takes `mobile` from the low-entropy values when the answer leaves it out", async () => {
        const { facts } = await new BrowserDeviceFactsAdapter(chromium(async () => ({ model: "Pixel 8" }))).gather()

        expect(facts.hints).toEqual({ mobile: true, model: "Pixel 8", platformVersion: "" })
    })

    it("goes without the hints for good when they are refused", async () => {
        const refusing = chromium(async () => Promise.reject(new DOMException("Not allowed", "NotAllowedError")))

        const { facts, late } = await new BrowserDeviceFactsAdapter(refusing).gather()

        expect(facts.hints).toBeNull()
        expect(late).toBe(false)
        expect(composeDeviceLabel(facts).name).toBe("Chrome on Android")
    })

    it("goes without the hints for good when asking throws at once", async () => {
        const throwing = chromium(() => {
            throw new TypeError("not available here")
        })

        const { facts, late } = await new BrowserDeviceFactsAdapter(throwing).gather()

        expect(facts.hints).toBeNull()
        expect(late).toBe(false)
    })

    it("goes without the hints when they are late, and says so", async () => {
        vi.useFakeTimers()
        const adapter = new BrowserDeviceFactsAdapter(chromium(() => new Promise(() => {})))

        const gathering = adapter.gather()
        await vi.advanceTimersByTimeAsync(HINTS_TIMEOUT_MS)

        const { facts, late } = await gathering
        expect(facts.hints).toBeNull()
        expect(late).toBe(true)
        expect(composeDeviceLabel(facts).name).toBe("Chrome on Android")
    })

    it("waits for hints that come in time, and leaves no timer behind", async () => {
        vi.useFakeTimers()
        const adapter = new BrowserDeviceFactsAdapter(
            chromium(() => new Promise((resolve) => setTimeout(() => resolve({ model: "Pixel 8" }), HINTS_TIMEOUT_MS - 100))),
        )

        const gathering = adapter.gather()
        await vi.advanceTimersByTimeAsync(HINTS_TIMEOUT_MS - 100)

        const { facts, late } = await gathering
        expect(facts.hints?.model).toBe("Pixel 8")
        expect(late).toBe(false)
        expect(vi.getTimerCount()).toBe(0)
    })

    it("has no hints to ask a browser that isn't Chromium", async () => {
        const gathered = await new BrowserDeviceFactsAdapter({ userAgent: FIREFOX }).gather()

        expect(gathered).toEqual({ facts: { client: "browser", userAgent: FIREFOX, hints: null }, late: false })
    })
})

describe("DesktopDeviceFactsAdapter", () => {
    const WINDOWS_APP =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) pinai/0.5.1 Chrome/138.0.0.0 Electron/37.2.0 Safari/537.36"
    const desktop = (facts: () => Promise<unknown>) =>
        new DesktopDeviceFactsAdapter({ device: { facts: vi.fn(facts) } } as unknown as DesktopBridge, WINDOWS_APP)

    const read = (facts: unknown, late = false) => async () => ({ facts, late })

    it("knows the system at once, from the User-Agent", () => {
        const adapter = desktop(read({ os: "Windows", model: "Dell XPS 13 9310", computerName: "alice-pc" }))

        expect(adapter.known()).toEqual({ client: "app", os: "Windows", model: null, computerName: null })
        expect(composeDeviceLabel(adapter.known()).name).toBe("Windows")
    })

    it("takes the computer's facts from the main process", async () => {
        const adapter = desktop(read({ os: "Windows", model: "Dell XPS 13 9310", computerName: "alice-pc" }))

        const gathered = await adapter.gather()

        expect(gathered).toEqual({
            facts: { client: "app", os: "Windows", model: "Dell XPS 13 9310", computerName: "alice-pc" },
            late: false,
        })
        expect(composeDeviceLabel(gathered.facts)).toEqual({ name: "Dell XPS 13 9310 (alice-pc)", kind: "laptop", client: "app" })
    })

    it("asks again next time when the main process fails", async () => {
        const gathered = await desktop(async () => Promise.reject(new Error("No handler registered for 'device:facts'"))).gather()

        expect(gathered).toEqual({ facts: { client: "app", os: "Windows", model: null, computerName: null }, late: true })
    })

    it("says so when a read ran past its cap, so the next request asks again", async () => {
        const gathered = await desktop(read({ os: "Windows", model: null, computerName: "alice-pc" }, true)).gather()

        expect(gathered).toEqual({ facts: { client: "app", os: "Windows", model: null, computerName: "alice-pc" }, late: true })
    })

    it("keeps only what the answer holds of the right shape", async () => {
        const gathered = await desktop(read({ os: "BeOS", model: 42, computerName: "bob-pc" }, "yes" as unknown as boolean)).gather()

        expect(gathered).toEqual({ facts: { client: "app", os: "Windows", model: null, computerName: "bob-pc" }, late: false })
        expect((await desktop(async () => "not facts").gather()).facts).toEqual(
            { client: "app", os: "Windows", model: null, computerName: null },
        )
    })
})

