import type { ReactNode } from "react"
import { tv } from "tailwind-variants"

const note = tv({
    base: "m-0 rounded-[14px] border border-dashed border-line2 px-3 py-2.5 text-[12.5px] leading-[1.45] text-muted-ink [&_b]:font-medium [&_b]:text-foreground",
    variants: {
        tone: {
            plain: "",
            error: "border-solid border-[color-mix(in_oklab,var(--dnd)_40%,transparent)] bg-[color-mix(in_oklab,var(--dnd)_7%,transparent)]",
        },
    },
    defaultVariants: { tone: "plain" },
})

interface SearchNoteProps {
    tone?: "plain" | "error"
    icon?: ReactNode
    children: ReactNode
}

/** A section's word instead of rows: nothing yet, nothing found, or what went wrong. */
export function SearchNote({ tone, icon, children }: SearchNoteProps) {
    if (!icon) return <p className={note({ tone })}>{children}</p>
    return (
        <div className={note({ tone, className: "flex items-center gap-2.5" })}>
            <span className="flex shrink-0">{icon}</span>
            <span>{children}</span>
        </div>
    )
}
