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
