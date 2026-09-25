import { Motif } from "@/presentation/atoms/motif/motif"

interface DateDividerProps {
    label: string
}

export function DateDivider({ label }: DateDividerProps) {
    return (
        <div className="mb-1 mt-3 flex items-center gap-3">
            <Motif variant="band" size={12} color="var(--accline)" className="h-2 flex-1 opacity-70" />
            <span className="rounded-full bg-surf2 px-[11px] py-[3px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
            </span>
            <Motif variant="band" size={12} color="var(--accline)" className="h-2 flex-1 opacity-70" />
        </div>
    )
}
