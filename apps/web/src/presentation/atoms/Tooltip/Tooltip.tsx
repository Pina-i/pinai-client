import {
    Tooltip as AriaTooltip,
    TooltipTrigger,
    type TooltipProps as AriaTooltipProps,
} from "react-aria-components"
import type { ReactNode } from "react"
import { cn } from "@/presentation/_libs/utils"

interface TooltipProps {
    content: ReactNode
    children: ReactNode
    placement?: AriaTooltipProps["placement"]
    delay?: number
    closeDelay?: number
}

export function Tooltip({
    content,
    children,
    placement = "top",
    delay = 500,
    closeDelay = 200,
}: TooltipProps) {
    return (
        <TooltipTrigger delay={delay} closeDelay={closeDelay}>
            {children}
            <AriaTooltip
                placement={placement}
                className={cn(
                    "z-50 border border-border bg-popover px-2.5 py-1.5",
                    "text-xs font-medium text-popover-foreground shadow-sm",
                    "entering:animate-in entering:fade-in-0",
                    "exiting:animate-out exiting:fade-out-0",
                )}
            >
                {content}
            </AriaTooltip>
        </TooltipTrigger>
    )
}
