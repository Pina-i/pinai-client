import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PING_SPACING_MS, pingsAgain } from "@pinai/domain/models/mute"
import { NotificationSoundWebAudioAdapter } from "@/adapters/sound/notification-sound-web-audio.adapter"

/** Records what Tō‘ere schedules: every oscillator's frequency and start, and the context's life. */
class FakeContext {
    state: "running" | "suspended" = "suspended"
    currentTime = 10
    sampleRate = 8000
    destination = {}
    started: { f: number; at: number }[] = []
    hisses = 0
    master: { gain: { value: number }; target: unknown } | null = null
    resumes = 0
    suspends = 0
    resumeAfter: Promise<void> = Promise.resolve()

    private param() {
        return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }
    }

    createGain() {
        const node = { gain: this.param(), target: undefined as unknown, connect: (to: unknown) => void (node.target = to) }
        this.master ??= node
        return node
    }

    createOscillator() {
        let f = 0
        const frequency = { ...this.param(), setValueAtTime: (value: number) => void (f = value) }
        return { type: "", frequency, connect() {}, start: (at: number) => this.started.push({ f, at }), stop() {} }
    }

    createBiquadFilter() {
        return { type: "", frequency: this.param(), Q: this.param(), connect() {} }
    }

    createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) }
    }

    createBufferSource() {
        return { buffer: null, loop: false, connect() {}, start: () => void (this.hisses += 1), stop() {} }
    }

    resume() {
        this.resumes += 1
        return this.resumeAfter.then(() => void (this.state = "running"))
    }

    suspend() {
        this.suspends += 1
        this.state = "suspended"
        return Promise.resolve()
    }
}

function adapter(ctx: FakeContext | null, clock: { now: number }, gestures: EventTarget | null = null) {
    return new NotificationSoundWebAudioAdapter(
        () => ctx as unknown as AudioContext,
        () => clock.now,
        gestures
    )
}

describe("pingsAgain", () => {
    it("rings the first message, then once per burst", () => {
        expect(pingsAgain(null, 0)).toBe(true)
        expect(pingsAgain(1000, 1000 + PING_SPACING_MS - 1)).toBe(false)
        expect(pingsAgain(1000, 1000 + PING_SPACING_MS)).toBe(true)
    })
})

describe("NotificationSoundWebAudioAdapter", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("rings Tō‘ere: two taps, the second higher, through one master at the lab's level", () => {
        const ctx = Object.assign(new FakeContext(), { state: "running" as const })

        adapter(ctx, { now: 0 }).playDmReceived()

        const t0 = 10.02
        expect(ctx.started).toEqual([
            { f: 440, at: t0 },
            { f: 440 * 0.42, at: t0 },
            { f: 520, at: t0 + 0.16 },
            { f: 520 * 0.42, at: t0 + 0.16 },
        ])
        expect(ctx.hisses).toBe(2)
        expect(ctx.master).toMatchObject({ gain: { value: 0.7 }, target: ctx.destination })
    })

    it("rings a burst of messages once", () => {
        const ctx = Object.assign(new FakeContext(), { state: "running" as const })
        const clock = { now: 0 }
        const sound = adapter(ctx, clock)

        sound.playDmReceived()
        clock.now = 100
        sound.playDmReceived()
        clock.now = PING_SPACING_MS
        sound.playDmReceived()

        expect(ctx.started).toHaveLength(8)
    })

    it("suspends the context once the sound has died away", () => {
        const ctx = Object.assign(new FakeContext(), { state: "running" as const })

        adapter(ctx, { now: 0 }).playDmReceived()
        vi.advanceTimersByTime(999)
        expect(ctx.suspends).toBe(0)
        vi.advanceTimersByTime(1)

        expect(ctx.suspends).toBe(1)
    })

    it("resumes a suspended context to ring, but drops a ping the resume made late", async () => {
        const ctx = new FakeContext()
        const clock = { now: 0 }
        const sound = adapter(ctx, clock)

        sound.playDmReceived()
        await ctx.resumeAfter
        await Promise.resolve()
        expect(ctx.started).toHaveLength(4)

        ctx.state = "suspended"
        let resumed!: () => void
        ctx.resumeAfter = new Promise((resolve) => (resumed = resolve))
        clock.now = 5000
        sound.playDmReceived()
        clock.now = 6000
        resumed()
        await ctx.resumeAfter
        await Promise.resolve()

        expect(ctx.started).toHaveLength(4)
    })

    it("is unlocked by the first gesture, and only the first", async () => {
        const ctx = new FakeContext()
        const page = new EventTarget()
        adapter(ctx, { now: 0 }, page)

        page.dispatchEvent(new Event("pointerdown"))
        page.dispatchEvent(new Event("keydown"))
        await ctx.resumeAfter
        await Promise.resolve()
        vi.runAllTimers()

        expect(ctx.resumes).toBe(1)
        expect(ctx.suspends).toBe(1)
        expect(ctx.started).toEqual([])
    })

    it("lets messages arrive silently without Web Audio", () => {
        const silent = adapter(null, { now: 0 })
        const refused = new NotificationSoundWebAudioAdapter(() => {
            throw new Error("NotAllowedError")
        })

        expect(() => silent.playDmReceived()).not.toThrow()
        expect(() => refused.playDmReceived()).not.toThrow()
    })
})
