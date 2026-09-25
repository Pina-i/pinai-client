import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type SplashModule = typeof import("@/presentation/_libs/splash-screen")

// The module keeps the splash's state for the page's lifetime, so each test loads a fresh copy.
async function boot(): Promise<{ el: HTMLElement; splash: SplashModule }> {
    document.body.innerHTML = '<div id="pn-splash" class="pn-splash"></div>'
    vi.resetModules()
    const splash = await import("@/presentation/_libs/splash-screen")
    return { el: document.getElementById("pn-splash")!, splash }
}

const shown = (el: HTMLElement) => !el.hidden && el.dataset.state === undefined

async function dismissBoot(splash: SplashModule, el: HTMLElement) {
    splash.holdSplashScreen()()
    await vi.advanceTimersByTimeAsync(1_500)
    expect(el.hidden).toBe(true)
}

describe("splash screen", () => {
    beforeEach(() => {
        vi.useFakeTimers({
            toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"],
        })
        sessionStorage.clear()
    })

    afterEach(() => {
        vi.useRealTimers()
        document.body.innerHTML = ""
    })

    it("fades out once the last hold is released, no sooner than 600 ms after navigation", async () => {
        const { el, splash } = await boot()
        sessionStorage.setItem("pn-splash-t0", "1")
        const release = splash.holdSplashScreen()

        release()
        await vi.advanceTimersByTimeAsync(500)
        expect(shown(el)).toBe(true)
        await vi.advanceTimersByTimeAsync(150)
        expect(el.dataset.state).toBe("leaving")

        await vi.advanceTimersByTimeAsync(400)
        expect(el.hidden).toBe(true)
        expect(sessionStorage.getItem("pn-splash-t0")).toBeNull()
    })

    it("stays up when the next screen takes a hold in the same commit", async () => {
        const { el, splash } = await boot()
        const releaseCallback = splash.holdSplashScreen()

        releaseCallback()
        const releaseGate = splash.holdSplashScreen()
        await vi.advanceTimersByTimeAsync(2_000)
        expect(shown(el)).toBe(true)

        releaseGate()
        await vi.advanceTimersByTimeAsync(500)
        expect(el.hidden).toBe(true)
    })

    it("does not come back for a hold shorter than the show delay", async () => {
        const { el, splash } = await boot()
        await dismissBoot(splash, el)

        const release = splash.holdSplashScreen()
        await vi.advanceTimersByTimeAsync(100)
        release()
        await vi.advanceTimersByTimeAsync(1_000)
        expect(el.hidden).toBe(true)
    })

    it("comes back for a long hold and then stays long enough to read", async () => {
        const { el, splash } = await boot()
        await dismissBoot(splash, el)
        expect(sessionStorage.getItem("pn-splash-t0")).toBeNull()

        const release = splash.holdSplashScreen()
        await vi.advanceTimersByTimeAsync(100)
        expect(el.hidden).toBe(true)
        await vi.advanceTimersByTimeAsync(100)
        expect(shown(el)).toBe(true)
        expect(sessionStorage.getItem("pn-splash-t0")).not.toBeNull()

        release()
        await vi.advanceTimersByTimeAsync(300)
        expect(shown(el)).toBe(true)
        await vi.advanceTimersByTimeAsync(400)
        expect(el.dataset.state).toBe("leaving")
    })

    it("lets a never-reshow hold extend the splash but never bring it back", async () => {
        const { el, splash } = await boot()
        const releaseBoot = splash.holdSplashScreen()
        const releaseList = splash.holdSplashScreen({ reshow: "never" })

        releaseBoot()
        await vi.advanceTimersByTimeAsync(1_000)
        expect(shown(el)).toBe(true)

        releaseList()
        await vi.advanceTimersByTimeAsync(500)
        expect(el.hidden).toBe(true)

        const pendingShow = splash.holdSplashScreen({ reshow: "never" })
        await vi.advanceTimersByTimeAsync(1_000)
        expect(el.hidden).toBe(true)
        pendingShow()
    })

    it("counts a release once however often it is called", async () => {
        const { el, splash } = await boot()
        const releaseA = splash.holdSplashScreen()
        splash.holdSplashScreen()

        releaseA()
        releaseA()
        await vi.advanceTimersByTimeAsync(1_000)
        expect(shown(el)).toBe(true)
    })

    it("hands a loader's loop and title to the next page, until the loader goes away", async () => {
        const { splash } = await boot()
        const stop = splash.carrySplashLoop("Connection to the island…")
        expect(Number(sessionStorage.getItem("pn-splash-t0"))).toBe(Date.now())
        expect(sessionStorage.getItem("pn-splash-title")).toBe("Connection to the island…")

        stop()
        expect(sessionStorage.getItem("pn-splash-t0")).toBeNull()
        expect(sessionStorage.getItem("pn-splash-title")).toBeNull()
    })

    it("does nothing on a page without the splash", async () => {
        const { splash } = await boot()
        document.body.innerHTML = ""
        expect(() => splash.holdSplashScreen()()).not.toThrow()
    })
})
