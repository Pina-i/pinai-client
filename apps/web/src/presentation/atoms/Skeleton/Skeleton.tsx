import type { HTMLAttributes } from "react"
import { tv } from "tailwind-variants"

const skeleton = tv({
    base: "block shrink-0 bg-surf3 motion-safe:animate-[pn-pulse_1.6s_ease-in-out_infinite]",
    variants: {
        shape: {
            line: "h-2.5 rounded-full",
            circle: "rounded-full",
            block: "rounded-[14px]",
        },
    },
    defaultVariants: { shape: "line" },
})

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
    shape?: "line" | "circle" | "block"
}

/** The shape of something still loading, pulsing unless motion is reduced. Sized by its caller. */
export function Skeleton({ shape, className, ...props }: SkeletonProps) {
    return <span aria-hidden className={skeleton({ shape, className })} {...props} />
}
