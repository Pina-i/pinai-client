import { cn } from "@/presentation/_libs/utils"

/** The shared floating-panel surface: every popover, menu and picker wears it. */
export const popoverSurface = cn(
    "rounded-[18px] border border-line2 bg-popover text-popover-foreground",
    "shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.02)]",
)
