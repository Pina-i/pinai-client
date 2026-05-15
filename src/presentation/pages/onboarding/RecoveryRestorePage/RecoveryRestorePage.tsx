import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { RecoveryPassphraseInput } from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"
import { cn } from "@/presentation/_libs/utils"

import { useRecoveryRestorePageViewModel } from "./RecoveryRestorePage.viewmodel"

/**
 * "Recover history · new device" — mirrors the prototype in
 * `web-client/design/screens/security.jsx::SecRecoverHistory`. Two visual
 * states share the same shell: empty (encouraging copy + Paste CTA) and
 * mid-entry (progress copy + Clear CTA). MSK + Device Root Key are
 * bootstrapped silently so both Restore and Start-fresh exit ready.
 */
export function RecoveryRestorePage() {
    const vm = useRecoveryRestorePageViewModel()
    const isMidEntry = vm.filledCount > 0
    const isRestoring = vm.status === "restoring"
    const initials = (vm.welcomeName[0] ?? "?").toUpperCase()

    return (
        <div className="flex min-h-screen items-center justify-center overflow-auto bg-background">
            <PageTransition
                className={cn(
                    "grid w-full max-w-[1200px] grid-cols-[1.1fr_1fr] gap-9",
                    "px-14 py-10",
                )}
            >
                {/* LEFT — copy */}
                <div>
                    <Breadcrumb />

                    <WelcomeChip
                        name={vm.welcomeName}
                        initials={initials}
                        deviceLabel={vm.deviceLabel}
                    />

                    {isMidEntry ? <HeroMidEntry /> : <HeroEmpty />}

                    <p className="m-0 mb-3.5 max-w-[520px] text-[14px] leading-[1.65] text-foreground">
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

                    {/* Action row */}
                    <div className={cn("mt-7 flex items-center gap-2.5", isMidEntry && "mt-6")}>
                        {isMidEntry ? (
                            <button
                                type="button"
                                onClick={vm.onClear}
                                disabled={isRestoring}
                                className={cn(
                                    "inline-flex h-[46px] items-center gap-2 rounded-[10px] border border-border-strong bg-transparent px-[18px]",
                                    "text-[13.5px] font-medium text-foreground",
                                    "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                                )}
                            >
                                <TrashIcon />
                                Clear all
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={vm.onPaste}
                                disabled={vm.status === "initializing"}
                                className={cn(
                                    "inline-flex h-[46px] items-center gap-2 rounded-[10px] border border-chat bg-transparent px-[18px]",
                                    "text-[13.5px] font-semibold text-chat",
                                    "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                                )}
                            >
                                <ClipboardIcon />
                                Paste passphrase
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => void vm.onRestore()}
                            disabled={!vm.canRestore || isRestoring}
                            className={cn(
                                "inline-flex h-[46px] items-center gap-2 rounded-[10px] border-none px-[22px]",
                                "text-[13.5px] font-semibold",
                                vm.canRestore && !isRestoring
                                    ? "bg-chat text-primary-foreground cursor-pointer hover:opacity-90"
                                    : "cursor-not-allowed",
                            )}
                            style={
                                vm.canRestore && !isRestoring
                                    ? undefined
                                    : {
                                          background: "color-mix(in oklab, var(--chat) 25%, transparent)",
                                          color: "color-mix(in oklab, var(--primary-foreground) 50%, transparent)",
                                      }
                            }
                        >
                            {isRestoring ? "Restoring…" : "Restore →"}
                        </button>

                        <span className="flex-1" />

                        <button
                            type="button"
                            onClick={vm.onStartFresh}
                            disabled={vm.status === "initializing" || isRestoring}
                            className={cn(
                                "inline-flex h-[42px] items-center rounded-[8px] border-none bg-transparent px-[14px]",
                                "text-[12.5px] text-muted-foreground underline underline-offset-[3px] opacity-65",
                                "cursor-pointer disabled:cursor-not-allowed disabled:opacity-30",
                            )}
                        >
                            Start fresh on this device
                        </button>
                    </div>

                    {vm.status === "error" && vm.error && (
                        <p className="mt-4 text-[12px] text-destructive">
                            {vm.error}
                        </p>
                    )}
                </div>

                {/* RIGHT — input card */}
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
            <span className="text-border-strong">›</span>
            <span>New device</span>
            <span className="text-border-strong">›</span>
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
        <div
            className={cn(
                "mb-3 inline-flex w-fit items-center gap-2.5 rounded-full py-2 pl-2 pr-3",
            )}
            style={{
                background: "color-mix(in oklab, var(--chat) 8%, var(--card))",
                border: "1px solid color-mix(in oklab, var(--chat) 28%, var(--border))",
            }}
        >
            <Avatar initials={initials} color="var(--chat)" size="sm" />
            <span className="font-mono text-[11px] tracking-[0.04em] text-foreground">
                Welcome back, <span className="font-semibold text-chat">{name}</span>
            </span>
            <span
                className="h-[3px] w-[3px] rounded-full"
                style={{ background: "var(--border-strong)" }}
            />
            <span className="font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
                {deviceLabel} · just paired
            </span>
        </div>
    )
}

function HeroEmpty() {
    return (
        <h1 className="title m-0 mb-3.5 text-[42px] font-normal leading-[1.05] tracking-[-0.02em] text-foreground">
            Pick up where you{" "}
            <em className="italic text-chat">left off.</em>
        </h1>
    )
}

function HeroMidEntry() {
    return (
        <h1 className="title m-0 mb-3.5 text-[42px] font-normal leading-[1.05] tracking-[-0.02em] text-foreground">
            Almost <em className="italic text-chat">there.</em>
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
    const color = tone === "warning" ? "var(--warning)" : "var(--muted-foreground)"
    return (
        <div className="flex items-start gap-[11px]">
            <span
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] font-mono text-[13px] font-semibold"
                style={{
                    background: `color-mix(in oklab, ${color} 18%, transparent)`,
                    color,
                }}
            >
                {icon}
            </span>
            <div className="flex-1 text-[12.5px] leading-[1.55] text-foreground">
                <span
                    className="mb-0.5 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color }}
                >
                    {title}
                </span>
                <span className="text-muted-foreground">{body}</span>
            </div>
        </div>
    )
}

function ClipboardIcon() {
    return (
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
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" />
            <path d="M9 14h6M9 18h4" />
        </svg>
    )
}

function TrashIcon() {
    return (
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
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
    )
}
