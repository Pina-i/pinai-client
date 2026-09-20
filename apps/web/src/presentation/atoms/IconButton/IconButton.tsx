import type { Ref } from "react"
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

export interface IconButtonProps extends Omit<AriaButtonProps, "className"> {
    className?: string
    /** Forwarded to the underlying React Aria Button — used as a popover anchor. */
    ref?: Ref<HTMLButtonElement>
}

export function IconButton({ className, ref, ...props }: IconButtonProps) {
    return (
        <AriaButton
            ref={ref}
            className={cn(
                "inline-flex items-center justify-center",
                "cursor-pointer outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                className,
            )}
            {...props}
        />
    )
}
