import { useState } from "react"
import { AlertTriangle, Check, Copy, Eye, EyeOff, Trash2 } from "lucide-react"

import { cn } from "@/presentation/_libs/utils"

const cardClass = cn(
    "rounded-[14px] border px-3.5 pb-3 pt-3.5",
    "border-[color-mix(in_oklab,var(--acc)_28%,var(--line2))]",
    "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--acc)_10%,var(--surf)),var(--surf))]",
)

const actionClass = cn(
    "inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-full border px-2.5",
    "font-sans text-[11px] transition-[background-color,color,opacity] duration-150",
    "disabled:cursor-not-allowed disabled:opacity-50",
)

interface RecoveryPassphraseCardProps {
    /** The 24 words this device holds. */
    words: string[]
    /** The listed devices, unrevoked, that say they hold the current generation; `null` while unknown. */
    heldBy: number | null
    /** Erases the saved history entries; the words stay. */
    onClear: () => void
    /** True while the clear request is in flight. */
    isClearing?: boolean
}

/** Settings → Devices' card, on a device holding the current passphrase: blurred until shown; clearing erases the saved entries only. */
export function RecoveryPassphraseCard({ words, heldBy, onClear, isClearing }: RecoveryPassphraseCardProps) {
    const [revealed, setRevealed] = useState(false)
    const [copied, setCopied] = useState(false)
    const [confirmClear, setConfirmClear] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(words.join(" "))
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
        } catch {
            // Clipboard might be denied (insecure context, permissions).
            // Surfaces nothing — the user can still copy by selecting the
            // text once revealed.
        }
    }

    const handleClear = () => {
        if (!confirmClear) {
            setConfirmClear(true)
            return
        }
        onClear()
        setConfirmClear(false)
    }

    return (
        <div className={cardClass}>
            <div className="mb-2.5 flex items-start justify-between gap-2.5">
                <div className="min-w-0">
                    {/* Each part whole on a phone: a line breaks only at a dot. */}
                    <span className="mono-eyebrow block lowercase">
                        <span className="whitespace-nowrap">history passphrase</span>{" "}
                        <span className="whitespace-nowrap">· {words.length} words</span>
                        {heldBy !== null && (
                            <>
                                {" "}
                                <span className="whitespace-nowrap">
                                    · held by {heldBy} {heldBy === 1 ? "device" : "devices"}
                                </span>
                            </>
                        )}
                    </span>
                    <span className="title text-[14.5px] font-medium tracking-[-0.005em] text-foreground">
                        Your key to past conversations
                        <em className="not-italic text-acc">.</em>
                    </span>
                </div>
                <div
                    className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px]",
                        revealed ? "bg-[color-mix(in_oklab,var(--acc)_18%,transparent)]" : "bg-surf3",
                    )}
                >
                    <span
                        className={cn(
                            "inline-block h-[5px] w-[5px] rounded-full",
                            revealed ? "bg-acc motion-safe:animate-[pn-pulse_1.6s_ease-in-out_infinite]" : "bg-muted-foreground",
                        )}
                    />
                    <span
                        className={cn(
                            "font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em]",
                            revealed ? "text-acc" : "text-muted-foreground",
                        )}
                    >
                        {revealed ? "revealed" : "hidden"}
                    </span>
                </div>
            </div>

            {/* Always rendered — the blur is the toggle, so there is no remount. The
                column count is fluid: a truncated recovery word is worse than a taller card. */}
            <div
                className={cn(
                    "grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-[5px] transition-[filter,opacity] duration-200",
                    !revealed && "select-none opacity-80 blur-[4px]",
                )}
                aria-hidden={!revealed}
            >
                {words.map((word, i) => (
                    <div
                        key={i}
                        className="flex min-w-0 items-center gap-[5px] rounded-[7px] border border-line bg-background px-1.5 py-1"
                    >
                        <span className="shrink-0 font-mono text-[8.5px] tracking-[0.05em] text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate font-mono text-[10.5px] font-medium text-foreground">
                            {word}
                        </span>
                    </div>
                ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    className={cn(
                        actionClass,
                        revealed
                            ? "border-line2 bg-transparent text-foreground hover:bg-surf2"
                            : "border-transparent bg-action font-semibold text-action-foreground hover:opacity-90",
                    )}
                    aria-pressed={revealed}
                >
                    {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {revealed ? "Hide" : "Show"}
                </button>
                <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!revealed}
                    className={cn(
                        actionClass,
                        "border-line2 bg-transparent text-foreground hover:bg-surf2 disabled:hover:bg-transparent",
                    )}
                >
                    {copied ? <Check className="h-3 w-3 text-on" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                </button>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={handleClear}
                    disabled={isClearing}
                    className={cn(
                        actionClass,
                        confirmClear
                            ? "border-dnd bg-dnd text-background hover:opacity-90"
                            : "border-line2 bg-transparent text-muted-foreground hover:text-dnd-ink",
                    )}
                >
                    <Trash2 className="h-3 w-3" />
                    {isClearing ? "Clearing…" : confirmClear ? "Confirm clear" : "Clear history backup"}
                </button>
            </div>

            <div
                className={cn(
                    "mt-2.5 flex items-center gap-[7px] rounded-[10px] px-2 py-[7px]",
                    "border border-[color-mix(in_oklab,var(--idle)_22%,var(--line))] bg-[color-mix(in_oklab,var(--idle)_7%,transparent)]",
                    "text-[10.5px] leading-[1.4] text-muted-foreground",
                )}
            >
                <AlertTriangle className="h-3 w-3 shrink-0 text-idle" />
                <span>With these words and your password, someone can read your history and approve a device as you.</span>
            </div>
        </div>
    )
}
