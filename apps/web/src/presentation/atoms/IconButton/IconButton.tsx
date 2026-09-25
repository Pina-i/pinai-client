import type { Ref } from "react"
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { tv } from "tailwind-variants"

const iconButton = tv({
    base: [
        "inline-flex items-center justify-center",
        "cursor-pointer outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:opacity-50 disabled:cursor-not-allowed",
    ].join(" "),
    variants: {
        variant: {
            /** No chrome — the caller styles it. */
            plain: "",
            /** The round 28px muted glyph button used across the chrome. */
            ghost: "h-7 w-7 shrink-0 rounded-full text-[13px] text-muted-foreground hover:bg-surf3 hover:text-foreground",
        },
        isActive: { true: "" },
        isDanger: {
            true: "bg-[color-mix(in_oklab,var(--dnd)_18%,transparent)] text-dnd hover:bg-[color-mix(in_oklab,var(--dnd)_18%,transparent)] hover:text-dnd",
        },
    },
    compoundVariants: [{ variant: "ghost", isActive: true, class: "text-foreground" }],
    defaultVariants: { variant: "plain" },
})

export interface IconButtonProps extends Omit<AriaButtonProps, "className"> {
    className?: string
    variant?: "plain" | "ghost"
    /** Ghost only: keeps the glyph at full contrast (its panel is open, its toggle is on). */
    isActive?: boolean
    isDanger?: boolean
    /** Forwarded to the underlying React Aria Button — used as a popover anchor. */
    ref?: Ref<HTMLButtonElement>
}

export function IconButton({ className, variant, isActive, isDanger, ref, ...props }: IconButtonProps) {
    return (
        <AriaButton
            ref={ref}
            className={iconButton({ variant, isActive, isDanger, className })}
            {...props}
        />
    )
}
