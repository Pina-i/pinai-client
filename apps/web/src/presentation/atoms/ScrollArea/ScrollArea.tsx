import type { HTMLAttributes } from "react"
import { cn } from "@/presentation/_libs/utils"

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
    className?: string
}

export function ScrollArea({ className, children, ...props }: ScrollAreaProps) {
    return (
        <div
            className={cn(
                "overflow-y-auto",
                "[&::-webkit-scrollbar]:w-1",
                "[&::-webkit-scrollbar-track]:bg-transparent",
                "[&::-webkit-scrollbar-thumb]:bg-border",
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}
