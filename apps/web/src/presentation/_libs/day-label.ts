/** "14 Mar 2026", in the reader's locale. */
export function dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
}
