import { cn } from "@/presentation/_libs/utils"

interface RecoveryPassphraseDisplayProps {
    words: string[]
    /** Tone of the badge in the header. Default `"strong"` / success. */
    badgeLabel?: string
    badgeTone?: "success" | "muted"
}

/** Read-only 3-col grid of numbered recovery words. */
export function RecoveryPassphraseDisplay({
    words,
    badgeLabel = "strong",
    badgeTone = "success",
}: RecoveryPassphraseDisplayProps) {
    return (
        <div
            className={cn(
                // py: 20 / px: 22 in the prototype
                "rounded-[var(--radius)] border border-border-strong bg-card px-[22px] py-5",
                "shadow-[0_12px_30px_-10px_rgba(0,0,0,0.4)]",
            )}
        >
            {/* Header row */}
            <div className="mb-3.5 flex items-center justify-between">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                    Passphrase · {words.length} words
                </span>
                <span
                    className={cn(
                        // padding 1.5px 7px in the prototype
                        "rounded-[4px] px-[7px] py-[1.5px]",
                        "font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]",
                        badgeTone === "success"
                            ? "bg-[color-mix(in_oklab,var(--success)_22%,transparent)] text-success"
                            : "bg-muted text-muted-foreground",
                    )}
                >
                    {badgeLabel}
                </span>
            </div>

            {/* 3-col word grid */}
            <div className="grid grid-cols-3 gap-x-[10px] gap-y-2">
                {words.map((word, i) => (
                    <div
                        key={`${i}-${word}`}
                        className={cn(
                            // padding 8px 10px in the prototype
                            "flex items-center gap-[9px] rounded-[7px] border border-border bg-muted px-[10px] py-2",
                        )}
                    >
                        <span
                            className={cn(
                                "w-[18px] shrink-0 text-right",
                                "font-mono text-[10px] tracking-[0.06em] text-muted-foreground",
                            )}
                        >
                            {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-[13px] font-medium text-foreground">
                            {word}
                        </span>
                    </div>
                ))}
            </div>

            {/* Reassurance footer */}
            <div
                className={cn(
                    // 10px 12px in the prototype
                    "mt-3.5 flex items-center gap-[9px] rounded-[8px] bg-muted px-3 py-2.5",
                    "text-[11.5px] text-muted-foreground",
                )}
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className="shrink-0"
                >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Made here on your device. We never see it.</span>
            </div>
        </div>
    )
}
