import { cn } from "@/presentation/_libs/utils"
import type { ReactNode } from "react"
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components"
import { tv } from "tailwind-variants"

export interface SwitchProps extends Omit<AriaSwitchProps, "className"> {
    className?: string
    children?: ReactNode
}

const track = tv({
    base: [
        "flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-0.5",
        "transition-[background-color,box-shadow] duration-200",
        "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
    ].join(" "),
    variants: {
        isSelected: {
            false: "bg-surf3",
            true: "bg-acc shadow-[0_0_16px_-4px_var(--acc)]",
        },
        isDisabled: {
            true: "opacity-50",
        },
    },
})

const handle = tv({
    base: "block h-[18px] w-[18px] rounded-full transition-[transform,background-color] duration-200",
    variants: {
        isSelected: {
            false: "bg-muted-foreground",
            true: "translate-x-4 bg-acc-ink",
        },
    },
})

export function Switch({ className, children, ...props }: SwitchProps) {
    return (
        <AriaSwitch
            {...props}
            className={cn(
                "group flex cursor-pointer items-center gap-2 text-sm text-foreground outline-none",
                "disabled:cursor-not-allowed disabled:text-muted-foreground",
                "[-webkit-tap-highlight-color:transparent]",
                className,
            )}
        >
            {({ isSelected, isDisabled }) => (
                <>
                    <div className={track({ isSelected, isDisabled })}>
                        <span className={handle({ isSelected })} />
                    </div>
                    {children}
                </>
            )}
        </AriaSwitch>
    )
}
