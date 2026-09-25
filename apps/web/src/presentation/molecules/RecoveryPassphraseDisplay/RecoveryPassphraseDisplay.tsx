import { LockKeyhole } from "lucide-react"
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
        <div className="rounded-[18px] border border-[color-mix(in_oklab,var(--acc)_28%,var(--line2))] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--acc)_10%,var(--surf)),var(--surf))] px-5 pb-4 pt-[18px] backdrop-blur-[14px]">
            <div className="mb-3.5 flex items-center justify-between">
                <span className="fact">Passphrase · {words.length} words</span>
                <span
                    className={cn(
                        "rounded-full px-2 py-[3px] font-mono text-[8.5px] font-medium uppercase tracking-[0.1em]",
                        badgeTone === "success"
                            ? "bg-[color-mix(in_oklab,var(--on)_18%,transparent)] text-on"
                            : "bg-surf3 text-muted-foreground",
                    )}
                >
                    {badgeLabel}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
                {words.map((word, i) => (
                    <div
                        key={`${i}-${word}`}
                        className="flex min-w-0 items-center gap-2 rounded-[7px] border border-line bg-background px-2.5 py-2"
                    >
                        <span className="w-4 shrink-0 text-right font-mono text-[8.5px] tracking-[0.05em] text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate font-mono text-[12px] font-medium text-foreground">{word}</span>
                    </div>
                ))}
            </div>

            <div className="mt-3.5 flex items-center gap-2 rounded-[10px] border border-line bg-surf2 px-2.5 py-2 text-[11px] leading-[1.4] text-muted-foreground">
                <LockKeyhole className="h-3 w-3 shrink-0 text-acc" />
                <span>Made here on your device. We never see it.</span>
            </div>
        </div>
    )
}
