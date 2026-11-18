import { useId, type ReactNode } from "react"
import { tv } from "tailwind-variants"

const ring = tv({
    slots: {
        badge: "flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] font-mono text-[10px]",
        line: "w-[1.5px] flex-1",
    },
    variants: {
        tone: {
            acc: { badge: "border-acc text-acc-text", line: "bg-[linear-gradient(var(--acc),transparent)]" },
            sec: { badge: "border-sec text-sec-text", line: "bg-[linear-gradient(var(--sec),transparent)]" },
            muted: {
                badge: "border-muted-foreground text-muted-ink",
                line: "bg-[linear-gradient(var(--muted-foreground),transparent)]",
            },
        },
    },
})

interface PeopleSectionProps {
    step: number
    tone: "acc" | "sec" | "muted"
    title: string
    subtitle: string
    children: ReactNode
}

/** One ring of the search, from the user's server outward. */
export function PeopleSection({ step, tone, title, subtitle, children }: PeopleSectionProps) {
    const titleId = useId()
    const { badge, line } = ring({ tone })
    return (
        <section aria-labelledby={titleId} className="relative grid grid-cols-[26px_minmax(0,1fr)] gap-3.5 pb-1 pt-3">
            <div aria-hidden className="flex flex-col items-center gap-1.5 pt-0.5">
                <span className={badge()}>{step}</span>
                <span className={line()} />
            </div>
            <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5">
                    <h3 id={titleId} className="title text-[17px] font-normal text-foreground">
                        {title}
                    </h3>
                    <span className="font-mono text-[10.5px] tracking-[.03em] text-muted-ink">{subtitle}</span>
                </div>
                {children}
            </div>
        </section>
    )
}
