import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, Copy } from "lucide-react"
import { cn } from "@/presentation/_libs/utils"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Button } from "@/presentation/atoms/Button/Button"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { RecoveryPassphraseDisplay } from "@/presentation/molecules/RecoveryPassphraseDisplay/RecoveryPassphraseDisplay"
import { useMinimumLoadingDuration } from "@/presentation/hooks/useMinimumLoadingDuration"
import { useRecoverySetupPageViewModel } from "./RecoverySetupPage.viewmodel"

const SETUP_LOADER_MIN_MS = 600

export function RecoverySetupPage() {
    const vm = useRecoverySetupPageViewModel()

    // Same smoothing as the gate loader, so a fast bootstrap still reads as intentional.
    const showSetupLoader = useMinimumLoadingDuration(
        vm.status === "running",
        SETUP_LOADER_MIN_MS,
    )

    const ctaDisabled = vm.status !== "done" || showSetupLoader

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-auto bg-background">
            <Backdrop />
            <PageTransition className="relative z-[2] grid w-full max-w-[1200px] grid-cols-[1.1fr_1fr] gap-9 px-14 py-10">
                <div>
                    <Breadcrumb trail={["Onboarding"]} current="Recovery passphrase" />

                    <h1 className="title m-0 mb-3.5 text-[42px] font-normal leading-[1.05] tracking-[-0.02em] text-foreground">
                        Bring your history <em className="italic text-acc">with you.</em>
                    </h1>

                    <p className="mb-3.5 mt-0 max-w-[520px] text-[14px] leading-[1.6] text-muted-foreground">
                        When you sign in on a new phone or laptop, this passphrase restores
                        your conversation history end-to-end. Without it, switching devices
                        means starting fresh — past messages stay encrypted on devices you've
                        already paired, but a brand-new device can't read them.
                    </p>

                    <div className="mt-[18px] flex max-w-[540px] flex-col gap-2.5">
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

                    <div className="mt-7 flex items-center gap-2.5">
                        <Button variant="secondary" size="inline" onPress={vm.onCopy} isDisabled={ctaDisabled}>
                            <Copy className="h-[15px] w-[15px]" />
                            Copy passphrase
                        </Button>
                        <Button size="inline" onPress={vm.onContinue} isDisabled={ctaDisabled}>
                            Continue
                            <ArrowRight className="h-[15px] w-[15px]" />
                        </Button>
                        <span className="flex-1" />
                        <Button
                            variant="ghost"
                            onPress={vm.onSkip}
                            isDisabled={ctaDisabled}
                            className="text-[12.5px] underline-offset-[3px]"
                        >
                            Skip for now
                        </Button>
                    </div>
                </div>

                {/* `checking` renders nothing: the fast-path hydrate resolves in a tick, a loader would flash. */}
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

interface BreadcrumbProps {
    trail: string[]
    current: string
}

function Breadcrumb({ trail, current }: BreadcrumbProps) {
    return (
        <div className="mb-3.5 flex items-center gap-[7px] text-[12px] text-muted-foreground">
            {trail.map((step) => (
                <span key={step} className="contents">
                    <span>{step}</span>
                    <span className="text-line2">›</span>
                </span>
            ))}
            <span className="font-medium text-foreground">{current}</span>
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
    const warning = tone === "warning"
    return (
        <div className="flex items-start gap-[11px]">
            <span
                className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] font-mono text-[12px] font-medium",
                    warning ? "bg-[color-mix(in_oklab,var(--idle)_16%,transparent)] text-idle" : "bg-surf3 text-muted-foreground",
                )}
                aria-hidden
            >
                {glyph}
            </span>
            <div className="flex-1 text-[12.5px] leading-[1.55]">
                <p className={cn("fact mb-0.5", warning && "text-idle")}>{title}</p>
                <span className="text-muted-foreground">{body}</span>
            </div>
        </div>
    )
}

function SetupLoading() {
    return (
        <div className="flex flex-col items-center justify-center gap-3.5 rounded-[18px] border border-line bg-surf px-6 py-12 backdrop-blur-[14px]">
            <div className="flex items-center gap-2.5">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="h-[5px] w-[5px] rounded-full bg-acc"
                        style={{ animation: `pn-bounce 1.1s ${i * 0.15}s ease-in-out infinite` }}
                    />
                ))}
            </div>
            <p className="fact">Setting up your recovery passphrase…</p>
        </div>
    )
}

interface SetupErrorProps {
    message: string
    onRetry: () => void
}

function SetupError({ message, onRetry }: SetupErrorProps) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-[color-mix(in_oklab,var(--dnd)_40%,var(--line))] bg-surf px-6 py-12 text-center backdrop-blur-[14px]">
            <p className="fact text-dnd">Setup failed</p>
            <p className="max-w-[300px] text-[12.5px] leading-[1.55] text-muted-foreground">{message}</p>
            <Button size="inline" onPress={onRetry} className="mt-2">
                Try again
            </Button>
        </div>
    )
}
