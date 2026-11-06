import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Motif } from "@/presentation/atoms/motif/motif"

interface PassShellProps {
    /** The instance this device signs in to, as "— kauai.studio" above the title; its first letter is the watermark. */
    instance: string
    title: ReactNode
    /** The focus goes to the title each time this changes to a value: what the page shows was replaced. */
    titleFocusKey?: string | null
    /** The tabs and their card, or what stands in for them. */
    children: ReactNode
    /** Under the card: signing out, going back. */
    footer?: ReactNode
}

// The pattern belongs to the left edge: the title and the card stand on a quiet ground.
const FADE = "linear-gradient(90deg, #000 0%, rgba(0,0,0,.7) 22%, rgba(0,0,0,.25) 45%, transparent 72%)"
const FADE_STYLE: CSSProperties = { maskImage: FADE, WebkitMaskImage: FADE }

/** "Pass": a device being let in — centred, the instance's motif fading in from the left over a soft accent wash. */
export function PassShell({ instance, title, titleFocusKey, children, footer }: PassShellProps) {
    const heading = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
        if (titleFocusKey) heading.current?.focus()
    }, [titleFocusKey])

    return (
        <div className="relative flex min-h-app flex-col items-center justify-center gap-[26px] overflow-hidden bg-background px-4 py-14 sm:px-6">
            <Backdrop />
            <div aria-hidden className="pointer-events-none absolute inset-0" style={FADE_STYLE}>
                <Motif variant="field" className="absolute inset-0" style={{ opacity: "var(--pass-motif-opacity)" }} />
            </div>
            <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-[46%] bg-[linear-gradient(90deg,color-mix(in_oklab,var(--acc)_7%,transparent),transparent)]"
            />
            <div
                aria-hidden
                className="title pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[560px] italic leading-none text-sec opacity-5 max-[520px]:text-[340px]"
            >
                {instance.charAt(0).toUpperCase()}
            </div>

            <header className="relative max-w-[640px] text-center">
                <p className="m-0 text-[11px] font-medium tracking-[0.01em] text-muted-foreground">— {instance}</p>
                <h1
                    ref={heading}
                    tabIndex={-1}
                    className="title m-0 mt-2.5 text-[40px] font-normal leading-[1.1] tracking-[-0.015em] text-foreground outline-none max-[520px]:text-[30px]"
                >
                    {title}
                </h1>
            </header>

            <div className="relative flex w-full flex-col items-center gap-[26px]">{children}</div>

            {footer && <footer className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-2">{footer}</footer>}
        </div>
    )
}

/** The card the open tab sits in. */
export function PassCard({ children }: { children: ReactNode }) {
    return (
        <div className="pn-auth-rise w-full max-w-[520px] overflow-hidden rounded-[26px] border border-line2 bg-popover shadow-[0_24px_60px_-16px_rgba(0,0,0,0.45)]">
            {children}
        </div>
    )
}
