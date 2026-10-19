import type { ReactNode } from "react"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Logo } from "@/presentation/atoms/Logo/Logo"
import { Motif } from "@/presentation/atoms/motif/motif"
import { cn } from "@/presentation/_libs/utils"
import { AuthTopRule } from "./auth-top-rule"

interface AuthShellProps {
    /** The form / interactive content rendered on the right column. */
    children: ReactNode
    /** Optional className passed to the right column. */
    rightClassName?: string
    /** Optional className passed to the right column's inner wrapper (380px wide by default). */
    panelClassName?: string
    /** Override the masthead (ReactNode so callers can mix in italic `em` accents). */
    leftHeadline?: ReactNode
    /** Override the body paragraph that sits under the headline. */
    leftDescription?: ReactNode
    /** Above the footer links, e.g. the landing's client download. */
    asideFooter?: ReactNode
}

const DEFAULT_HEADLINE = (
    <>
        Quiet
        <br />
        <em className="italic text-acc">rooms</em>,
        <br />
        loud
        <br />
        <em className="italic text-sec">voices</em>.
    </>
)

const DEFAULT_DESCRIPTION =
    "A community space you host yourself. Federated by design, owned by the people who gather in it."

export function AuthShell({
    children,
    rightClassName,
    panelClassName,
    leftHeadline,
    leftDescription,
    asideFooter,
}: AuthShellProps) {
    return (
        <div className="relative min-h-screen overflow-hidden bg-background">
            <Backdrop />
            <AuthTopRule />

            <div className="relative z-[2] grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
                <aside className="flex flex-col justify-between gap-7 border-line px-14 pb-10 pt-[84px] lg:border-r">
                    <span className="inline-flex items-center gap-3 text-foreground">
                        <Logo className="h-[34px] w-[46px]" />
                        <span className="title text-[24px] font-semibold">Pīna'i</span>
                    </span>

                    <div className="my-12 lg:my-0">
                        <h1 className="title m-0 text-[length:min(74px,11.5vh)] font-normal leading-[0.96] tracking-[-0.025em] text-foreground">
                            {leftHeadline ?? DEFAULT_HEADLINE}
                        </h1>
                        <p className="mt-[26px] max-w-[38ch] text-[14px] leading-[1.6] text-muted-foreground">
                            {leftDescription ?? DEFAULT_DESCRIPTION}
                        </p>
                        <Motif variant="band" className="mt-[30px] h-2.5 max-w-[300px] opacity-55" />
                    </div>

                    <div className="flex flex-col gap-[22px]">
                        {asideFooter}
                        <nav className="flex gap-5">
                            {["Docs", "Status", "Source"].map((label) => (
                                <a
                                    key={label}
                                    href={`#${label.toLowerCase()}`}
                                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground no-underline transition-colors hover:text-foreground"
                                >
                                    ↳ {label}
                                </a>
                            ))}
                        </nav>
                    </div>
                </aside>

                <main className={cn("flex items-center justify-center px-10 pb-10 pt-[84px]", rightClassName)}>
                    <div className={cn("w-full max-w-[380px]", panelClassName)}>{children}</div>
                </main>
            </div>
        </div>
    )
}
