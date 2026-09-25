import { ArrowRight, ClipboardPaste, Trash2 } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Button } from "@/presentation/atoms/Button/Button"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { RecoveryPassphraseInput } from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"
import { cn } from "@/presentation/_libs/utils"

import { useRecoveryRestorePageViewModel } from "./RecoveryRestorePage.viewmodel"

// MSK + Device Root Key are bootstrapped silently, so both Restore and Start fresh exit ready.
export function RecoveryRestorePage() {
    const vm = useRecoveryRestorePageViewModel()
    const isMidEntry = vm.filledCount > 0
    const isRestoring = vm.status === "restoring"
    const initials = (vm.welcomeName[0] ?? "?").toUpperCase()

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-auto bg-background">
            <Backdrop />
            <PageTransition className="relative z-[2] grid w-full max-w-[1200px] grid-cols-[1.1fr_1fr] gap-9 px-14 py-10">
                <div>
                    <Breadcrumb />

                    <WelcomeChip
                        name={vm.welcomeName}
                        initials={initials}
                        deviceLabel={vm.deviceLabel}
                    />

                    {isMidEntry ? <HeroMidEntry /> : <HeroEmpty />}

                    <p className="m-0 mb-3.5 max-w-[520px] text-[14px] leading-[1.6] text-muted-foreground">
                        {isMidEntry ? (
                            <>
                                We've matched {vm.filledCount} of your 24 words. {24 - vm.filledCount}{" "}
                                {24 - vm.filledCount === 1 ? "is" : "are"} still empty — finish those and
                                we'll restore everything.
                            </>
                        ) : (
                            <>
                                Your old conversations are sealed on your other devices — only the 24
                                words you saved can unlock them here. Paste or type them once, and your
                                messages, photos and rooms come right back.
                            </>
                        )}
                    </p>

                    <div className="mt-[18px] flex max-w-[540px] flex-col gap-2.5">
                        {isMidEntry ? (
                            <>
                                <RowFact
                                    icon="✓"
                                    title="What's ready"
                                    body={`${vm.filledCount} of 24 words match the dictionary. ${
                                        24 - vm.filledCount
                                    } ${24 - vm.filledCount === 1 ? "slot remains" : "slots remain"} empty.`}
                                />
                                <RowFact
                                    icon="↺"
                                    title="Take your time"
                                    body="Order matters — they must be in the same sequence you saved."
                                />
                            </>
                        ) : (
                            <>
                                <RowFact
                                    icon="↺"
                                    title="Bring everything back"
                                    body="Past chats, voice rooms you're in, the friends you've added. All restored on this device."
                                />
                                <RowFact
                                    icon="✓"
                                    title="Faster: paste them all"
                                    body="Most password managers can paste the whole 24 words at once."
                                />
                                <RowFact
                                    icon="?"
                                    title="Lost the passphrase?"
                                    body="You can still chat from this device — but messages from before today won't follow you here."
                                    tone="warning"
                                />
                            </>
                        )}
                    </div>

                    <div className={cn("mt-7 flex items-center gap-2.5", isMidEntry && "mt-6")}>
                        {isMidEntry ? (
                            <Button variant="secondary" size="inline" onPress={vm.onClear} isDisabled={isRestoring}>
                                <Trash2 className="h-[15px] w-[15px]" />
                                Clear all
                            </Button>
                        ) : (
                            <Button
                                variant="secondary"
                                size="inline"
                                onPress={vm.onPaste}
                                isDisabled={vm.status === "initializing"}
                            >
                                <ClipboardPaste className="h-[15px] w-[15px]" />
                                Paste passphrase
                            </Button>
                        )}

                        <Button
                            size="inline"
                            onPress={() => void vm.onRestore()}
                            isDisabled={!vm.canRestore || isRestoring}
                        >
                            {isRestoring ? "Restoring…" : "Restore"}
                            {!isRestoring && <ArrowRight className="h-[15px] w-[15px]" />}
                        </Button>

                        <span className="flex-1" />

                        <Button
                            variant="ghost"
                            onPress={vm.onStartFresh}
                            isDisabled={vm.status === "initializing" || isRestoring}
                            className="text-[12.5px] underline-offset-[3px]"
                        >
                            Start fresh on this device
                        </Button>
                    </div>

                    {vm.status === "error" && vm.error && (
                        <p className="mt-4 text-[12px] text-dnd">
                            {vm.error}
                        </p>
                    )}
                </div>

                <div>
                    <RecoveryPassphraseInput
                        value={vm.words}
                        onChange={vm.setWords}
                        disabled={isRestoring}
                        handleRef={vm.inputHandleRef}
                    />
                </div>
            </PageTransition>
        </div>
    )
}

function Breadcrumb() {
    return (
        <div className="mb-3.5 flex items-center gap-[7px] text-[12px] text-muted-foreground">
            <span>Sign in</span>
            <span className="text-line2">›</span>
            <span>New device</span>
            <span className="text-line2">›</span>
            <span className="font-medium text-foreground">Recover history</span>
        </div>
    )
}

interface WelcomeChipProps {
    name: string
    initials: string
    deviceLabel: string
}

function WelcomeChip({ name, initials, deviceLabel }: WelcomeChipProps) {
    return (
        <div className="mb-3 inline-flex w-fit items-center gap-2.5 rounded-full border border-[color-mix(in_oklab,var(--acc)_28%,var(--line2))] bg-[color-mix(in_oklab,var(--acc)_8%,var(--surf))] py-1.5 pl-1.5 pr-3">
            <Avatar initials={initials} tone="acc" size="sm" />
            <span className="text-[12px] text-foreground">
                Welcome back, <span className="title text-[14px] font-semibold text-acc">{name}</span>
            </span>
            <span className="h-[3px] w-[3px] rounded-full bg-line2" />
            <span className="fact fact-plain">{deviceLabel} · just paired</span>
        </div>
    )
}

function HeroEmpty() {
    return (
        <h1 className="title m-0 mb-3.5 text-[42px] font-normal leading-[1.05] tracking-[-0.02em] text-foreground">
            Pick up where you{" "}
            <em className="italic text-acc">left off.</em>
        </h1>
    )
}

function HeroMidEntry() {
    return (
        <h1 className="title m-0 mb-3.5 text-[42px] font-normal leading-[1.05] tracking-[-0.02em] text-foreground">
            Almost <em className="italic text-acc">there.</em>
        </h1>
    )
}

interface RowFactProps {
    icon: string
    title: string
    body: string
    tone?: "warning"
}

function RowFact({ icon, title, body, tone }: RowFactProps) {
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
                {icon}
            </span>
            <div className="flex-1 text-[12.5px] leading-[1.55]">
                <p className={cn("fact mb-0.5", warning && "text-idle")}>{title}</p>
                <span className="text-muted-foreground">{body}</span>
            </div>
        </div>
    )
}
