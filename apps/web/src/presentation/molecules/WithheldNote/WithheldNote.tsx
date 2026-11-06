import type { ReactNode } from "react"

import { cn } from "@/presentation/_libs/utils"

interface WithheldNoteProps {
    children: ReactNode
    /** Spacing from what it sits under. */
    className?: string
}

/** Why an action isn't offered, said in its place. */
export function WithheldNote({ children, className }: WithheldNoteProps) {
    return <p className={cn("title m-0 text-[11px] italic leading-[1.45] text-muted-foreground", className)}>{children}</p>
}
