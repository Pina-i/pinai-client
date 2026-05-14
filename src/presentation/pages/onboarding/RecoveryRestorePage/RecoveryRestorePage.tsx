import { ClipboardPaste } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { RecoveryPassphraseInput } from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"
import { cn } from "@/presentation/_libs/utils"
import { useRecoveryRestorePageViewModel } from "./RecoveryRestorePage.viewmodel"

export function RecoveryRestorePage() {
    const vm = useRecoveryRestorePageViewModel()

    const onPasteFromClipboard = async () => {
        try {
            const raw = await navigator.clipboard.readText()
            const tokens = raw
                .split(/\s+/)
                .map((t) => t.toLowerCase().trim())
                .filter(Boolean)
                .slice(0, vm.words.length)
            const next = [...vm.words]
            for (let i = 0; i < tokens.length; i++) next[i] = tokens[i]
            vm.setWords(next)
        } catch {
            // Browser blocked clipboard read — user can still type or
            // paste into the first slot manually.
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center overflow-auto bg-background">
            <PageTransition
                className={cn(
                    "grid w-full grid-cols-[1.1fr_1fr] gap-9",
                    "px-14 py-10",
                    "max-w-[1200px]",
                )}
            >
                {/* LEFT — copy + actions */}
                <div className="flex flex-col">
                    <Breadcrumb />

                    <h1
                        className={cn(
                            "mb-3.5 mt-1 font-serif text-[42px] font-normal leading-[1.05] tracking-[-0.02em]",
                            "text-foreground",
                        )}
                    >
                        Pick up where you{" "}
                        <em className="italic text-chat">left off.</em>
                    </h1>

                    <p className="max-w-[520px] text-[14px] leading-[1.65] text-foreground">
                        Your old conversations are sealed on your other devices — only
                        the 24 words you saved can unlock them here. Paste or type them
                        once, and your messages, photos and rooms come right back.
                    </p>

                    <div className="mt-5 flex max-w-[540px] flex-col gap-2.5">
                        <RowFact
                            glyph="↺"
                            title="Bring everything back"
                            body="Past chats, voice rooms you're in, the friends you've added. All restored on this device."
                        />
                        <RowFact
                            glyph="✓"
                            title="Faster: paste them all"
                            body="Most password managers can paste the whole 24 words at once."
                        />
                        <RowFact
                            glyph="?"
                            title="Lost the passphrase?"
                            body="You can still chat from this device — but messages from before today won't follow you here."
                            tone="warning"
                        />
                    </div>

                    {vm.blobMissing && !vm.probing && (
                        <div
                            className={cn(
                                "mt-5 max-w-[540px] rounded-[10px] border px-3.5 py-3",
                                "border-[color-mix(in_oklab,var(--warning)_32%,var(--border))]",
                                "bg-[color-mix(in_oklab,var(--warning)_7%,var(--background))]",
                                "text-[12.5px] leading-[1.55] text-foreground",
                            )}
                        >
                            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.12em] font-semibold text-warning">
                                No saved passphrase
                            </div>
                            <span className="text-muted-foreground">
                                This account doesn't have a recovery passphrase configured.
                                You can still start fresh on this device — pairing from
                                another device will land in a future update.
                            </span>
                        </div>
                    )}

                    {/* Action row */}
                    <div className="mt-7 flex items-center gap-2.5">
                        <Button
                            onPress={onPasteFromClipboard}
                            isDisabled={vm.blobMissing || vm.status !== "idle"}
                            variant="primary"
                            className={cn(
                                "h-[46px] gap-2 rounded-[10px] border border-chat bg-transparent px-4 py-3",
                                "text-[13.5px] font-semibold text-chat hover:bg-chat/10 hover:opacity-100",
                                "shadow-none",
                            )}
                        >
                            <ClipboardPaste className="h-4 w-4" />
                            Paste passphrase
                        </Button>
                        <Button
                            onPress={() => void vm.onRestore()}
                            isDisabled={!vm.canRestore}
                            variant="primary"
                            className={cn(
                                "h-[46px] gap-2 rounded-[10px] bg-chat px-5 py-3",
                                "text-[13.5px] font-semibold text-primary-foreground",
                                "shadow-[0_8px_18px_-8px_color-mix(in_oklab,var(--chat)_70%,transparent)]",
                            )}
                        >
                            {vm.status === "restoring" ? "Restoring…" : "Restore →"}
                        </Button>
                        <span className="flex-1" />
                        <button
                            type="button"
                            onClick={() => void vm.onStartFresh()}
                            disabled={vm.status !== "idle"}
                            className={cn(
                                "rounded-[8px] px-3.5 py-2.5",
                                "font-mono text-[12.5px] text-muted-foreground underline decoration-2 underline-offset-4",
                                "opacity-65 hover:opacity-100",
                                "disabled:cursor-not-allowed disabled:opacity-30",
                            )}
                        >
                            {vm.status === "fresh-bootstrapping"
                                ? "Starting…"
                                : "Start fresh on this device"}
                        </button>
                    </div>
                </div>

                {/* RIGHT — input card */}
                <div>
                    <RecoveryPassphraseInput
                        value={vm.words}
                        onChange={vm.setWords}
                        disabled={vm.blobMissing}
                    />
                </div>
            </PageTransition>
        </div>
    )
}

function Breadcrumb() {
    return (
        <div className="mb-3.5 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>Sign in</span>
            <span className="text-border-strong">›</span>
            <span>New device</span>
            <span className="text-border-strong">›</span>
            <span className="font-medium text-foreground">Recover history</span>
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
        <div className="flex items-start gap-3">
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
            <div className="flex-1 text-[12.5px] leading-[1.55] text-foreground">
                <div
                    className={cn(
                        "mb-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] font-semibold",
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
