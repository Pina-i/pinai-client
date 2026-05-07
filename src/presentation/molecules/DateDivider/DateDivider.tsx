interface DateDividerProps {
    label: string
}

export function DateDivider({ label }: DateDividerProps) {
    return (
        <div className="mb-1.5 mt-[18px] flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>{label}</span>
            <div className="h-px flex-1 bg-border" />
        </div>
    )
}

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    )
}

/** Human label for a day separator: "Today", "Yesterday", or "Tuesday, April 22". */
export function formatDateDividerLabel(date: Date): string {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (isSameDay(date, today)) return "Today"
    if (isSameDay(date, yesterday)) return "Yesterday"
    return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    })
}
