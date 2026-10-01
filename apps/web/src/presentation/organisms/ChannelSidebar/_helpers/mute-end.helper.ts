const MINUTE_MS = 60_000

export const MUTE_STEP_MINUTES = 15
export const MAX_MUTE_MINUTES = 24 * 60

function startOfMinute(at: number): number {
    return Math.floor(at / MINUTE_MS) * MINUTE_MS
}

export function clockTime(at: number): string {
    const date = new Date(at)
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function isAnotherDay(at: number, now: number): boolean {
    return new Date(at).toDateString() !== new Date(now).toDateString()
}

export function muteUntilLabel(until: number | null, now: number = Date.now()): string {
    if (until === null) return "until you unmute"
    return `until ${isAnotherDay(until, now) ? "tomorrow " : ""}${clockTime(until)}`
}

export function durationLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${hours} h ${rest} min` : `${hours} h`
}

// On the minute, so the end reads as exactly the time it shows.
export function muteEndIn(minutes: number, now: number): number {
    return startOfMinute(now) + minutes * MINUTE_MS
}

export function minutesUntil(end: number, now: number): number {
    return Math.round((end - startOfMinute(now)) / MINUTE_MS)
}

/** Steps on the 15-minute grid, within 15 min – 24 h. */
export function stepMuteEnd(end: number, delta: number, now: number): number {
    const minutes = Math.round((minutesUntil(end, now) + delta) / MUTE_STEP_MINUTES) * MUTE_STEP_MINUTES
    return muteEndIn(Math.min(MAX_MUTE_MINUTES, Math.max(MUTE_STEP_MINUTES, minutes)), now)
}

/** The next time the clock shows `hours:minutes` — tomorrow's once today's has passed; `null` if it isn't a time. */
export function nextClockTime(hours: string, minutes: string, now: number): number | null {
    if (!/^\d{1,2}$/.test(hours) || !/^\d{1,2}$/.test(minutes)) return null
    const h = Number(hours)
    const m = Number(minutes)
    if (h > 23 || m > 59) return null
    const target = new Date(now)
    target.setHours(h, m, 0, 0)
    if (target.getTime() <= now) target.setDate(target.getDate() + 1)
    return target.getTime()
}
