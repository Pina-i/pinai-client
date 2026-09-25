import { cn } from "@/presentation/_libs/utils"

/** The centered dialog panel. Consumers set the width. */
export const modalSurface = cn(
    "flex max-h-[84vh] max-w-[92vw] flex-col overflow-hidden rounded-[22px] border border-line2 bg-popover text-popover-foreground",
    "shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55)]",
)
