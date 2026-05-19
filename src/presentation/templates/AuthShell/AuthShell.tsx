import type { ReactNode } from "react"
import { Logo } from "@/presentation/atoms/Logo/Logo"
import { cn } from "@/presentation/_libs/utils"

interface AuthShellProps {
    /** The form / interactive content rendered on the right column. */
    children: ReactNode
    /** Optional className passed to the right-column inner wrapper. */
    rightClassName?: string
    /**
     * Override the editorial left-panel headline (ReactNode so callers can mix
     * serif + italic accent spans). Defaults to the "Quiet rooms, loud voices"
     * landing copy.
     */
    leftHeadline?: ReactNode
    /** Override the body paragraph that sits under the headline. */
    leftDescription?: ReactNode
}

const DEFAULT_HEADLINE = (
    <>
        Quiet
        <br />
        <em className="font-light italic text-chat">rooms</em>,
        <br />
        loud
        <br />
        <em className="font-light italic text-voice">voices</em>.
    </>
)

const DEFAULT_DESCRIPTION =
    "A community space you host yourself. Federated by design, owned by the people who gather in it."

/**
 * Editorial sign-in shell. Two-column layout (1.1fr / 1fr) on a dark canvas
 * with ambient sage + amber gradients and a subtle grain overlay. The left
 * column is a fixed editorial mark — title, serif masthead, footer links —
 * and matches the `design/screens/signin.jsx` reference. The right column is
 * a slot so `LandingPage` and `LoginPage` can plug their respective forms in
 * without redefining the chrome.
 *
 * Mono coordinates run along the top edge; mono link list runs along the
 * bottom-left. All colours come from the OKLCH token system, so a theme
 * switch flips the whole layout without further work.
 */
export function AuthShell({ children, rightClassName, leftHeadline, leftDescription }: AuthShellProps) {
    return (
        <div className="relative min-h-screen overflow-hidden bg-background">
            {/* Ambient backdrop — sage top-right, amber bottom-left. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    backgroundImage: `
                        radial-gradient(900px 500px at 70% 20%, color-mix(in oklab, var(--chat) 10%, transparent), transparent 60%),
                        radial-gradient(700px 500px at 20% 110%, color-mix(in oklab, var(--voice) 8%, transparent), transparent 55%)
                    `,
                }}
            />
            {/* Subtle film grain — 3.5% opacity overlay. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
                }}
            />

            {/* Top rule: version + tagline. Sits over the grid so the
                vertical divider underneath it spans the full viewport. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-8 pt-6 mono-eyebrow">
                <span className="pointer-events-auto">Pīna'i · v2.0.4</span>
                <span className="pointer-events-auto">Self-hosted · Federated · Open-source</span>
            </div>

            <div className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
                {/* ── LEFT — editorial mark ──────────────────────────────── */}
                <aside className="flex flex-col justify-between border-border px-14 pb-16 pt-24 lg:border-r">
                    <div className="flex items-center gap-3 text-foreground">
                        <Logo className="h-9 w-9 text-foreground" />
                        <span className="title text-2xl font-medium tracking-[-0.01em]">Pīna'i</span>
                    </div>

                    <div className="my-12">
                        <h1 className="title text-[76px] font-light leading-[0.95] tracking-[-0.025em] text-foreground">
                            {leftHeadline ?? DEFAULT_HEADLINE}
                        </h1>
                        <p className="mt-7 max-w-sm text-[14px] leading-[1.55] text-muted-foreground">
                            {leftDescription ?? DEFAULT_DESCRIPTION}
                        </p>
                    </div>

                    <nav className="flex gap-5 mono-eyebrow">
                        <a href="#docs" className="hover:text-foreground">↳ Docs</a>
                        <a href="#status" className="hover:text-foreground">↳ Status</a>
                        <a href="#source" className="hover:text-foreground">↳ Source</a>
                    </nav>
                </aside>

                {/* ── RIGHT — form slot ──────────────────────────────────── */}
                <main className={cn("flex items-center justify-center px-10 pb-16 pt-24", rightClassName)}>
                    <div className="w-full max-w-[380px]">{children}</div>
                </main>
            </div>
        </div>
    )
}
