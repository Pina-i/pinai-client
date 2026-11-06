import { Laptop } from "lucide-react"

import { cn } from "@/presentation/_libs/utils"

interface DoorHeadProps {
    /** "New sign-in", "Start over request". */
    eyebrow: string
    title: string
    /** The device asking, by name. */
    device: string
    /** "asked 2 minutes ago · kauai.studio" (`useAskedLine`). */
    asked: string
    /** `dnd` for a request that would erase something. */
    tone?: "acc" | "dnd"
}

/** The head of a prompt about another device's request: what it is, and the device asking. */
export function DoorHead({ eyebrow, title, device, asked, tone = "acc" }: DoorHeadProps) {
    return (
        <>
            <div>
                <p className="eye">— {eyebrow}</p>
                <h2 className="title m-0 mt-1.5 text-[32px] font-normal leading-[1.1] tracking-[-0.015em] text-foreground">{title}</h2>
            </div>
            <div className="flex items-center gap-3.5 rounded-[16px] border border-line bg-surf px-4 py-3.5">
                <span
                    className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]",
                        tone === "dnd" ? "bg-[color-mix(in_oklab,var(--dnd)_14%,transparent)] text-dnd-ink" : "bg-acc-soft text-acc",
                    )}
                >
                    <Laptop className="h-[22px] w-[22px]" strokeWidth={1.9} aria-hidden />
                </span>
                <span className="min-w-0">
                    <span className="title block truncate text-[18px] font-semibold text-foreground">{device}</span>
                    <span className="fact fact-plain mt-[3px] block">{asked}</span>
                </span>
            </div>
        </>
    )
}
