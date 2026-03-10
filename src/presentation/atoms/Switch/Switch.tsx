import { cn } from "@/presentation/_libs/utils"
import { motion } from "motion/react"
import type { ReactNode } from "react"
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components"
import { tv } from "tailwind-variants"

export interface SwitchProps extends Omit<AriaSwitchProps, "className"> {
    className?: string
    children?: ReactNode
}

const track = tv({
    base: "flex h-5 w-9 box-border px-px items-center shrink-0 cursor-default rounded-full border transition-colors duration-200 ease-in-out group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
    variants: {
        isSelected: {
            false: "bg-input border-border group-pressed:bg-muted",
            true: "bg-primary border-transparent group-pressed:opacity-90",
        },
        isDisabled: {
            true: "opacity-50 cursor-not-allowed",
        },
    },
})

const handle = tv({
    base: "h-4 w-4 rounded-full shadow-sm transition-colors duration-200 ease-in-out",
    variants: {
        isSelected: {
            false: "bg-foreground",
            true: "bg-primary-foreground",
        },
        isDisabled: {
            false: "",
            true: "",
        },
    },
    compoundVariants: [
        {
            isSelected: false,
            isDisabled: true,
            class: "bg-muted-foreground",
        },
        {
            isSelected: true,
            isDisabled: true,
            class: "bg-background",
        },
    ],
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
                        <motion.span
                            initial={false}
                            className={handle({ isSelected, isDisabled })}
                            animate={{ x: isSelected ? "100%" : "0%" }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                        />
                    </div>
                    {children}
                </>
            )}
        </AriaSwitch>
    )
}
