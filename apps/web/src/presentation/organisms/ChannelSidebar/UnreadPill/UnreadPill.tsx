import { cn } from "@/presentation/_libs/utils"

interface UnreadPillProps {
    count: number
    isMuted?: boolean
    className?: string
}

export function UnreadPill({ count, isMuted = false, className }: UnreadPillProps) {
    return (
        <span
            className={cn(
                "shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px]",
                isMuted ? "bg-surf3 font-medium text-muted-foreground" : "bg-acc font-bold text-acc-ink",
                className,
            )}
        >
            {count}
        </span>
    )
}
