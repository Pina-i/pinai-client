import { cn } from "@/presentation/_libs/utils"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { RecoveryPassphraseInput } from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"

import { useRecoveryRestorePageViewModel } from "./RecoveryRestorePage.viewmodel"

/**
 * Phase 7 — history-restore onboarding page.
 *
 * The user types their existing 24-word passphrase; we derive HAK,
 * paginate the server-side encrypted archive, decrypt each entry,
 * and push successful entries into the dm slice. AES-GCM auth-tag
 * failures are silently skipped (wrong passphrase → 0 restored,
 * N skipped → toast "wrong passphrase").
 */
export function RecoveryRestorePage() {
    const vm = useRecoveryRestorePageViewModel()
    const isRestoring = vm.status === "restoring"
    const isDone = vm.status === "done"

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
                    <div className="mb-3.5 flex items-center gap-[7px] text-[12px] text-muted-foreground">
                        <span>Onboarding</span>
                        <span className="text-border-strong">›</span>
                        <span className="font-medium text-foreground">Restore history</span>
                    </div>

                    <h1 className="title m-0 text-[34px] font-normal leading-[1.1] tracking-[-0.018em] text-foreground">
                        Restore your messages
                        <em className="italic text-chat">.</em>
                    </h1>
                    <p className="mt-3 max-w-[460px] text-[13px] leading-[1.5] text-muted-foreground">
                        Type the 24 words from a device that's already pina-paired.
                        If they match the passphrase you saved before, every message
                        you backed up since then will appear here.
                    </p>

                    <div className="mt-5 max-w-[460px] space-y-2 text-[12px] leading-[1.5] text-muted-foreground">
                        <p>
                            <span className="text-foreground">Don't have your passphrase?</span>{" "}
                            Skip restore — you'll start fresh on this device. Past messages
                            will stay accessible on devices you're already signed into.
                        </p>
                        <p>
                            <span className="text-foreground">Wrong passphrase?</span>{" "}
                            We can't tell which words are wrong (your archive is encrypted),
                            so a typo means zero entries decrypt. Double-check word order
                            and spelling.
                        </p>
                    </div>

                    {/* Action row */}
                    <div className="mt-7 flex items-center gap-2">
                        <button
                            type="button"
                            disabled={!vm.canRestore || isRestoring || isDone}
                            onClick={() => void vm.onRestore()}
                            className={cn(
                                "inline-flex h-9 items-center justify-center rounded-md px-3.5",
                                "font-sans text-[12.5px] font-semibold",
                                "bg-chat text-primary-foreground hover:opacity-90",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            {isRestoring ? "Restoring…" : isDone ? "Restored" : "Restore history"}
                        </button>
                        <button
                            type="button"
                            onClick={vm.onSkip}
                            disabled={isRestoring}
                            className={cn(
                                "inline-flex h-9 items-center justify-center rounded-md px-3.5",
                                "font-sans text-[12.5px]",
                                "border border-border-strong bg-transparent text-foreground hover:bg-accent/40",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            {isDone ? "Continue to home" : "Skip"}
                        </button>
                    </div>

                    {vm.status === "done" && (
                        <p className="mt-4 text-[12px] text-muted-foreground">
                            <span className="font-medium text-foreground">
                                {vm.restored} message{vm.restored === 1 ? "" : "s"}
                            </span>{" "}
                            restored
                            {vm.skipped > 0 && (
                                <>
                                    , {vm.skipped} skipped
                                    {vm.restored === 0 && (
                                        <span className="text-destructive"> — wrong passphrase?</span>
                                    )}
                                </>
                            )}
                            .
                        </p>
                    )}

                    {vm.status === "error" && vm.error && (
                        <p className="mt-4 text-[12px] text-destructive">
                            Restore failed: {vm.error}
                        </p>
                    )}
                </div>

                {/* RIGHT — input grid */}
                <div>
                    <RecoveryPassphraseInput value={vm.words} onChange={vm.setWords} />
                </div>
            </PageTransition>
        </div>
    )
}
