import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { tv } from "tailwind-variants"

const chip = tv({
    base: [
        "inline-flex h-7 items-center rounded-full border px-[11px]",
        "font-mono text-[10.5px] text-foreground [font-variant-ligatures:none]",
        "cursor-pointer outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    ].join(" "),
    variants: {
        isSelected: {
            true: "border-acc-line bg-acc-soft",
            false: "border-line2 bg-surf2 hover:bg-surf3",
        },
    },
    defaultVariants: { isSelected: false },
})

export interface ChipProps extends Omit<AriaButtonProps, "className"> {
    /** It names what is in use right now, e.g. the address the field resolved. */
    isSelected?: boolean
    className?: string
}

/** A mono pill naming a fact the user can pick again, such as a recent instance. */
export function Chip({ isSelected, className, ...props }: ChipProps) {
    return <AriaButton className={chip({ isSelected, className })} {...props} />
}
