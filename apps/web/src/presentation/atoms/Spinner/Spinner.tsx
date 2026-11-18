import { ProgressBar } from "react-aria-components"
import { tv } from "tailwind-variants"

const spinner = tv({
    base: "inline-block shrink-0 rounded-full border-line2 border-t-acc motion-safe:animate-spin",
    variants: {
        size: {
            sm: "h-2.5 w-2.5 border-[1.5px]",
            md: "h-3.5 w-3.5 border-2",
        },
    },
    defaultVariants: { size: "md" },
})

interface SpinnerProps {
    size?: "sm" | "md"
    /** Names the work for assistive technology, as an indeterminate progress bar: a pending React Aria `Button` reads it. */
    label?: string
    className?: string
}

/** A small turning ring for work under way; still when motion is reduced. Without a label, decorative. */
export function Spinner({ size, label, className }: SpinnerProps) {
    const ring = <i aria-hidden className={spinner({ size, className })} />
    if (!label) return ring
    return (
        <ProgressBar aria-label={label} isIndeterminate className="inline-flex shrink-0">
            {ring}
        </ProgressBar>
    )
}
