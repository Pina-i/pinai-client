import { pingsAgain } from "@pinai/domain/models/mute"
import type { INotificationSoundPort } from "@pinai/domain/ports/notification-sound.port"
import { TOERE_SECONDS, toere, whiteNoise } from "./toere"

/** The sound lab's level. */
const VOLUME = 0.7
/** A browser lets a page play sound only once it has been interacted with, and Safari only from within that gesture. */
const GESTURES = ["pointerdown", "keydown", "touchend"] as const
/** A ping waiting on a context to resume is dropped past this, rather than rung late. */
const STALE_MS = 1000

interface Voice {
    ctx: AudioContext
    out: GainNode
    noise: AudioBuffer
}

/**
 * One AudioContext for the page's life: unlocked by the first gesture,
 * suspended whenever nothing rings, so the audio device is not held open.
 */
export class NotificationSoundWebAudioAdapter implements INotificationSoundPort {
    private readonly createContext: () => AudioContext | null
    private readonly now: () => number
    private voice: Voice | null = null
    private lastPingAt: number | null = null
    private rest: ReturnType<typeof setTimeout> | null = null

    constructor(
        createContext: () => AudioContext | null = browserContext,
        now: () => number = () => performance.now(),
        gestures: EventTarget | null = typeof window === "undefined" ? null : window
    ) {
        this.createContext = createContext
        this.now = now
        const unlock = () => {
            for (const gesture of GESTURES) gestures?.removeEventListener(gesture, unlock, true)
            const voice = this.ready()
            voice?.ctx.resume().then(() => this.restAfter(voice, 0), ignore)
        }
        for (const gesture of GESTURES) gestures?.addEventListener(gesture, unlock, { capture: true, passive: true })
    }

    playDmReceived(): void {
        const asked = this.now()
        if (!pingsAgain(this.lastPingAt, asked)) return
        this.lastPingAt = asked
        const voice = this.ready()
        if (!voice) return
        this.cancelRest()
        if (voice.ctx.state === "running") {
            this.ring(voice)
            return
        }
        voice.ctx.resume().then(() => {
            if (this.now() - asked < STALE_MS) this.ring(voice)
            else this.restAfter(voice, 0)
        }, ignore)
    }

    private ready(): Voice | null {
        if (this.voice) return this.voice
        try {
            const ctx = this.createContext()
            if (!ctx) return null
            const out = ctx.createGain()
            out.gain.value = VOLUME
            out.connect(ctx.destination)
            this.voice = { ctx, out, noise: whiteNoise(ctx) }
        } catch {
            // No Web Audio here, or the browser refused it: messages arrive silently.
        }
        return this.voice
    }

    private ring(voice: Voice): void {
        toere(voice.ctx, voice.out, voice.ctx.currentTime + 0.02, voice.noise)
        this.restAfter(voice, (TOERE_SECONDS + 0.4) * 1000)
    }

    private restAfter(voice: Voice, ms: number): void {
        this.cancelRest()
        this.rest = setTimeout(() => {
            this.rest = null
            voice.ctx.suspend().catch(ignore)
        }, ms)
    }

    private cancelRest(): void {
        if (this.rest !== null) clearTimeout(this.rest)
        this.rest = null
    }
}

function browserContext(): AudioContext | null {
    const Context = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    return Context ? new Context() : null
}

function ignore(): void {}
