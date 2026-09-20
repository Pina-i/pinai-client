import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/presentation/_libs/utils"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { RecoveryPassphraseDisplay } from "@/presentation/molecules/RecoveryPassphraseDisplay/RecoveryPassphraseDisplay"
import { useMinimumLoadingDuration } from "@/presentation/hooks/useMinimumLoadingDuration"
import { useRecoverySetupPageViewModel } from "./RecoverySetupPage.viewmodel"

const SETUP_LOADER_MIN_MS = 600

/**
 * Pixel-equivalent of `web-client/design/screens/security.jsx::SecRecoveryKey`.
 *
 * The design uses plain `<button>` elements with inline-style sizing
 * (compact, side-by-side). Using our `Button` atom here would inject
 * `w-full` from its `primary` variant and stretch the buttons across
 * the row — fighting the prototype's layout. So we mirror the raw
 * markup.
 */
export function RecoverySetupPage() {
    const vm = useRecoverySetupPageViewModel()

    // Same smoothing as the gate's "Preparing your encrypted space…"
    // loader — keep the "Setting up your recovery passphrase…" card
    // visible long enough to register as intentional even when the
    // bootstrap finishes fast.
    const showSetupLoader = useMinimumLoadingDuration(
        vm.status === "running",
        SETUP_LOADER_MIN_MS,
    )

    const ctaDisabled = vm.status !== "done" || showSetupLoader

    return (
        <div className="flex min-h-screen items-center justify-center overflow-auto bg-background">
            <PageTransition
                className={cn(
                    "grid w-full grid-cols-[1.1fr_1fr] gap-9",
                    "px-14 py-10",
                    "max-w-[1200px]",
                )}
            >
                {/* LEFT — copy */}
                <div>
                    {/* Breadcrumb */}
                    <div className="mb-3.5 flex items-center gap-[7px] text-[12px] text-muted-foreground">
                        <span>Onboarding</span>
                        <span className="text-border-strong">›</span>
                        <span className="font-medium text-foreground">Recovery passphrase</span>
                    </div>

                    {/* H1 */}
                    <h1
                        className={cn(
                            "m-0 mb-3.5 block font-serif text-[42px] font-normal",
                            "leading-[1.05] tracking-[-0.02em] text-foreground",
                        )}
                    >
                        Bring your history{" "}
                        <em className="italic text-chat">with you.</em>
                    </h1>

                    {/* Lede */}
                    <p
                        className={cn(
                            "mt-0 mb-3.5 max-w-[520px] text-[14px] leading-[1.65] text-foreground",
                        )}
                    >
                        When you sign in on a new phone or laptop, this passphrase restores
                        your conversation history end-to-end. Without it, switching devices
                        means starting fresh — past messages stay encrypted on devices you've
                        already paired, but a brand-new device can't read them.
                    </p>

                    {/* Fact rows */}
                    <div className="mt-[18px] flex max-w-[540px] flex-col gap-[10px]">
                        <RowFact
                            glyph="↺"
                            title="Switching devices"
                            body="Type these 24 words on your new device to unlock prior conversations."
                        />
                        <RowFact
                            glyph="✕"
                            title="If you skip"
                            body="You can pair more devices later from Settings → Devices, but old messages won't follow them."
                        />
                        <RowFact
                            glyph="!"
                            title="If you lose it"
                            body="Anyone holding the words can sign in. Keep them somewhere only you reach — paper, password manager."
                            tone="warning"
                        />
                    </div>

                    {/* Action row */}
                    <div className="mt-7 flex items-center gap-[10px]">
                        <button
                            type="button"
                            onClick={vm.onCopy}
                            disabled={ctaDisabled}
                            className={cn(
                                "inline-flex h-[46px] items-center gap-2 rounded-[10px]",
                                "border border-chat bg-transparent px-[18px] py-3",
                                "text-[13.5px] font-semibold text-chat",
                                "cursor-pointer transition-colors hover:bg-chat/10",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                            >
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy passphrase
                        </button>

                        <button
                            type="button"
                            onClick={vm.onContinue}
                            disabled={ctaDisabled}
                            className={cn(
                                "inline-flex h-[46px] items-center gap-2 rounded-[10px]",
                                "border-0 bg-chat px-[22px] py-3",
                                "text-[13.5px] font-semibold text-primary-foreground",
                                "cursor-pointer transition-opacity hover:opacity-90",
                                "shadow-[0_8px_18px_-8px_color-mix(in_oklab,var(--chat)_70%,transparent)]",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            Continue →
                        </button>

                        <span className="flex-1" />

                        <button
                            type="button"
                            onClick={vm.onSkip}
                            disabled={ctaDisabled}
                            className={cn(
                                "h-[42px] cursor-pointer rounded-[8px] border-0 bg-transparent px-[14px] py-[10px]",
                                "text-[12.5px] text-muted-foreground underline underline-offset-[3px]",
                                "opacity-55 transition-opacity hover:opacity-90",
                                "disabled:cursor-not-allowed disabled:opacity-30",
                            )}
                        >
                            Skip for now
                        </button>
                    </div>
                </div>

                {/* RIGHT — passphrase card or loading/error state.
                  * `checking` renders nothing — that path is the
                  * "already-onboarded, fast-path hydrate" flow which
                  * resolves in a single tick, so a loader there would
                  * just flash. The "Setting up your recovery
                  * passphrase…" loader is reserved for the *actual*
                  * bootstrap work (status === "running"), and held
                  * visible for at least 600 ms via
                  * `useMinimumLoadingDuration` so the cross-fade to
                  * the word grid feels intentional. */}
                <div>
                    <AnimatePresence mode="wait">
                        {showSetupLoader && (
                            <motion.div
                                key="setup-loader"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                            >
                                <SetupLoading />
                            </motion.div>
                        )}
                        {!showSetupLoader && vm.status === "error" && (
                            <motion.div
                                key="setup-error"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                            >
                                <SetupError
                                    message={vm.error ?? "Setup failed."}
                                    onRetry={vm.onRetry}
                                />
                            </motion.div>
                        )}
                        {!showSetupLoader && vm.status === "done" && (
                            <motion.div
                                key="setup-done"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                            >
                                <RecoveryPassphraseDisplay words={vm.words} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </PageTransition>
        </div>
    )
}

interface RowFactProps {
    glyph: string
    title: string
    body: string
    tone?: "muted" | "warning"
}

function RowFact({ glyph, title, body, tone = "muted" }: RowFactProps) {
    const colourClass =
        tone === "warning"
            ? "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-warning"
            : "bg-[color-mix(in_oklab,var(--muted-foreground)_18%,transparent)] text-muted-foreground"
    return (
        <div className="flex items-start gap-[11px]">
            <span
                className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px]",
                    "font-mono text-[13px] font-semibold",
                    colourClass,
                )}
                aria-hidden
            >
                {glyph}
            </span>
            <div className="flex-1 text-[12.5px] leading-[1.55]">
                <div
                    className={cn(
                        "mb-[2px] font-mono text-[9.5px] uppercase tracking-[0.12em] font-semibold",
                        tone === "warning" ? "text-warning" : "text-muted-foreground",
                    )}
                >
                    {title}
                </div>
                <span className="text-muted-foreground">{body}</span>
            </div>
        </div>
    )
}

function SetupLoading() {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-[var(--radius)]",
                "border border-border-strong bg-card px-6 py-12",
                "shadow-[0_12px_30px_-10px_rgba(0,0,0,0.4)]",
            )}
        >
            <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-chat [animation-delay:0ms]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-chat [animation-delay:150ms]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-chat [animation-delay:300ms]" />
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
                Setting up your recovery passphrase…
            </p>
        </div>
    )
}

interface SetupErrorProps {
    message: string
    onRetry: () => void
}

function SetupError({ message, onRetry }: SetupErrorProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center gap-3 rounded-[var(--radius)]",
                "border border-destructive/40 bg-card px-6 py-12 text-center",
            )}
        >
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-destructive">
                Setup failed
            </p>
            <p className="max-w-[300px] text-[12.5px] text-muted-foreground">{message}</p>
            <button
                type="button"
                onClick={onRetry}
                className={cn(
                    "mt-2 cursor-pointer rounded-[8px] border-0 bg-chat px-4 py-2",
                    "text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90",
                )}
            >
                Try again
            </button>
        </div>
    )
}
