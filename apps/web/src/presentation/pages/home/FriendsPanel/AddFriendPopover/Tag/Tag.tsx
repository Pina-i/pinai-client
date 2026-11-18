import type { ReactNode } from "react"
import { tv } from "tailwind-variants"

const tag = tv({
    base: "inline-flex h-[18px] min-w-0 items-center gap-1 whitespace-nowrap rounded-full px-[7px] font-mono text-[9.5px] tracking-[.04em] [&_svg]:h-2.5 [&_svg]:w-2.5 [&_svg]:shrink-0",
    variants: {
        tone: {
            plain: "bg-surf2 text-muted-ink",
            acc: "bg-acc-soft text-acc-text",
        },
    },
    defaultVariants: { tone: "plain" },
})

export function Tag({ tone, icon, children }: { tone?: "plain" | "acc"; icon: ReactNode; children: ReactNode }) {
    return (
        <span className={tag({ tone })}>
            {icon}
            <span className="truncate">{children}</span>
        </span>
    )
}
