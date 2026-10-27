/**
 * Times as the screens word them, relative to `now`. Both answer `null` for a date that can't be
 * read, so a screen shows no "NaN years ago".
 */

/**
 * How long ago `iso` was: "just now", "N minutes ago", "N hours ago", "yesterday", "N days ago",
 * then weeks, months and years. A time ahead of `now` (clocks disagree) is "just now".
 */
export function formatLastSeen(iso: string, now: Date): string | null {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return null
    const sec = Math.floor(Math.max(0, now.getTime() - then) / 1000)

    if (sec < 60) return "just now"

    const min = Math.floor(sec / 60)
    if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`

    const hour = Math.floor(min / 60)
    if (hour < 24) return hour === 1 ? "1 hour ago" : `${hour} hours ago`

    const day = Math.floor(hour / 24)
    if (day === 1) return "yesterday"
    if (day < 7) return `${day} days ago`

    const week = Math.floor(day / 7)
    if (week < 4) return week === 1 ? "1 week ago" : `${week} weeks ago`

    const month = Math.floor(day / 30)
    if (month < 12) return month === 1 ? "1 month ago" : `${month} months ago`

    const year = Math.floor(day / 365)
    return year === 1 ? "1 year ago" : `${year} years ago`
}

/**
 * When a link stops working: "expires in 7 days", "expires in 5 hours" — rounded up, as the IdP's
 * invitation page words it — or "expired" once `at` has passed.
 */
export function expiryWording(at: string, now: Date): string | null {
    const end = new Date(at).getTime()
    if (Number.isNaN(end)) return null
    const seconds = Math.floor((end - now.getTime()) / 1000)
    if (seconds <= 0) return "expired"
    const hours = Math.ceil(seconds / 3_600)
    const [count, unit] = hours < 24 ? [hours, "hour"] : [Math.ceil(seconds / 86_400), "day"]
    return `expires in ${count} ${unit}${count === 1 ? "" : "s"}`
}
