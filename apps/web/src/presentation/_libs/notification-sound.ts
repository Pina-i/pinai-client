/**
 * Plays a subtle two-tone ping using the Web Audio API.
 * Silent no-op if AudioContext is unavailable.
 */
export function playDmNotificationSound(): void {
    try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.type = "sine"
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08)

        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)

        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.35)
        osc.onended = () => ctx.close()
    } catch {
        // AudioContext unavailable — silent failure
    }
}
