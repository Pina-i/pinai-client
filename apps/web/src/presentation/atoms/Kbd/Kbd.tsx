import type { HTMLAttributes } from "react"
import { cn } from "@/presentation/_libs/utils"

/** A key or a shortcut as a mono chip: "⌘K", "esc", "↵". */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
    return <kbd className={cn("shrink-0 rounded-full bg-surf3 px-[7px] py-0.5 font-mono text-[9px]", className)} {...props} />
}
