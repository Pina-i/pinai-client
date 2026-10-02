/**
 * The card's "Friends since" value: the day the friendship was accepted, on the viewer's calendar,
 * written day first as a passport's dates are.
 */
export function formatFriendsSince(since: string | null, timeZone?: string): string {
    if (!since) return "Not friends"
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(
        new Date(since),
    )
}
