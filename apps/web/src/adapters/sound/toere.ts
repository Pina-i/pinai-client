/**
 * Tō‘ere, the slit drum: two muted wooden taps, the second a touch higher and
 * lighter — dry and close, filtered so it never clicks. Synthesised, from the
 * design system's sound lab (`sound-lab-sounds.js`), node for node.
 */
export const TOERE_SECONDS = 0.6

/** Schedules the sound on `out`, starting at `t0`; `noise` is a looping buffer of white noise. */
export function toere(ctx: BaseAudioContext, out: AudioNode, t0: number, noise: AudioBuffer): void {
    const lowpass = filter(ctx, "lowpass", 2200, 0.7, out)
    const tap = (t: number, f: number, amp: number) => {
        const body = gain(ctx, lowpass)
        envelope(body, t, 0.004, amp, 0.22)
        oscillator(ctx, f, t, 0.25, body).frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.09)

        const knock = gain(ctx, lowpass)
        knock.gain.setValueAtTime(amp * 0.5, t)
        knock.gain.exponentialRampToValueAtTime(0.0001, t + 0.035)
        hiss(ctx, noise, t, 0.05, filter(ctx, "bandpass", f * 2.4, 1.2, knock))

        const low = gain(ctx, lowpass)
        envelope(low, t, 0.006, amp * 0.6, 0.3)
        oscillator(ctx, f * 0.42, t, 0.32, low).frequency.exponentialRampToValueAtTime(f * 0.3, t + 0.12)
    }
    tap(t0, 440, 0.5)
    tap(t0 + 0.16, 520, 0.32)
}

/** Two seconds of white noise, for the knock of each tap. */
export function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    return buffer
}

function oscillator(ctx: BaseAudioContext, f: number, t: number, seconds: number, out: AudioNode): OscillatorNode {
    const node = ctx.createOscillator()
    node.type = "sine"
    node.frequency.setValueAtTime(f, t)
    node.connect(out)
    node.start(t)
    node.stop(t + seconds + 0.05)
    return node
}

function gain(ctx: BaseAudioContext, out: AudioNode): GainNode {
    const node = ctx.createGain()
    node.gain.value = 0
    node.connect(out)
    return node
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q: number, out: AudioNode): BiquadFilterNode {
    const node = ctx.createBiquadFilter()
    node.type = type
    node.frequency.value = f
    node.Q.value = q
    node.connect(out)
    return node
}

function hiss(ctx: BaseAudioContext, noise: AudioBuffer, t: number, seconds: number, out: AudioNode): void {
    const node = ctx.createBufferSource()
    node.buffer = noise
    node.loop = true
    node.connect(out)
    node.start(t)
    node.stop(t + seconds + 0.05)
}

/** Attack to `peak`, then an exponential release to silence at `t + seconds`. */
function envelope(node: GainNode, t: number, attack: number, peak: number, seconds: number): void {
    node.gain.setValueAtTime(0.0001, t)
    node.gain.linearRampToValueAtTime(peak, t + attack)
    node.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
}
