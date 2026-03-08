import { cn } from "@/presentation/_libs/utils"
import type { ReactNode } from "react"
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components"

export interface SwitchProps extends Omit<AriaSwitchProps, "className"> {
    className?: string
    children?: ReactNode
}

export function Switch({ className, children, ...props }: SwitchProps) {
    return (
        <AriaSwitch
            className={cn("group flex cursor-pointer items-center gap-2 outline-none", "disabled:cursor-not-allowed disabled:opacity-50", className)}
            {...props}
        ></AriaSwitch>
    )
}
