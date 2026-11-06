/** "14 Mar 2026", in the reader's locale. */
export function dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
}

/** "Friday 13 November, 10:00", in the reader's locale: a day and an hour, read at a glance. */
export function momentLabel(at: number): string {
    return new Date(at).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
}
