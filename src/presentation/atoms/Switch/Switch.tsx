import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"
import type { ReactNode } from "react"

export interface SwitchProps extends Omit<AriaSwitchProps, "className"> {
    className?: string
    children?: ReactNode
}

export function Switch({ className, children, ...props }: SwitchProps) {
    return (
        <AriaSwitch
            className={cn(
                "group flex cursor-pointer items-center gap-2 outline-none",
                "disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            {...props}
        >
            {/* Track */}
            <span
                className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 items-center",
                    "border-2 border-border bg-muted transition-colors",
                    "group-data-[selected]:border-primary group-data-[selected]:bg-primary",
                    "group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-ring group-data-[focus-visible]:ring-offset-2",
                )}
            >
                {/* Thumb */}
                <span
                    className={cn(
                        "block h-3 w-3 shrink-0 translate-x-0.5 bg-muted-foreground transition-transform",
                        "group-data-[selected]:translate-x-[18px] group-data-[selected]:bg-primary-foreground",
                    )}
                />
            </span>

            {children}
        </AriaSwitch>
    )
}
