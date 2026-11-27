/** "14:02", in the reader's locale; nothing for a time that can't be read. */
export function timeOfDay(iso: string): string {
    const at = new Date(iso)
    return Number.isNaN(at.getTime()) ? "" : at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

/** When a conversation's last message came, as its row says it: the time today, the weekday this week, else the date. */
export function rowTime(iso: string, now: Date): string | null {
    const at = new Date(iso)
    if (Number.isNaN(at.getTime())) return null
    // Rounded: a day that changed the clocks is 23 or 25 hours long.
    const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000)
    if (days <= 0) return timeOfDay(iso)
    if (days < 7) return at.toLocaleDateString(undefined, { weekday: "short" })
    return at.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        ...(at.getFullYear() !== now.getFullYear() && { year: "numeric" }),
    })
}

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}
