/**
 * Relative-time formatter for the Settings → Devices "Last seen"
 * line. Pure: takes an ISO-8601 timestamp + a `now` for tests, returns
 * a short human string.
 *
 * Thresholds match common UX patterns (Discord, Slack):
 *   < 60 s        → "just now"
 *   < 60 min      → "N minute(s) ago"
 *   < 24 h        → "N hour(s) ago"
 *   24-48 h       → "yesterday"
 *   < 7 days      → "N days ago"
 *   < 4 weeks     → "N week(s) ago"
 *   < 12 months   → "N month(s) ago"
 *   else          → "N year(s) ago"
 */
export function formatLastSeen(iso: string, now: Date = new Date()): string {
    const then = new Date(iso).getTime()
    const diffMs = Math.max(0, now.getTime() - then)
    const sec = Math.floor(diffMs / 1000)

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
