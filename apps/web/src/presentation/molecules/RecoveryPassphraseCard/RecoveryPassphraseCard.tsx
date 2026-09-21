import { useState } from "react"
import { AlertTriangle, Check, Copy, Eye, EyeOff, Trash2 } from "lucide-react"

import { cn } from "@/presentation/_libs/utils"

interface RecoveryPassphraseCardProps {
    /** The 24-word mnemonic, or null when not stored on this device. */
    words: string[] | null
    /** Wipes the server blob + local copy. */
    onClear: () => void
    /** True while the clear request is in flight. */
    isClearing?: boolean
    /** Defaults to "Your key to past conversations." */
    title?: string
}

/**
 * Settings → Devices passphrase card. Blurred by default. The Show /
 * Hide toggle lifts the blur in place — words stay in the DOM either
 * way (no remount on toggle, less flicker, easier to copy from inspect
 * tools if the user really wants to). "Clear recovery key" wipes the
 * server blob + the local stash.
 *
 * Renders a "no passphrase on this device" empty state when `words`
 * is null (a paired-via-QR device that joined without seeing the
 * mnemonic).
 */
export function RecoveryPassphraseCard({
    words,
    onClear,
    isClearing,
    title = "Your key to past conversations",
}: RecoveryPassphraseCardProps) {
    const [revealed, setRevealed] = useState(false)
    const [copied, setCopied] = useState(false)
    const [confirmClear, setConfirmClear] = useState(false)

    if (!words) {
        return (
            <div
                className={cn(
                    "rounded-[10px] border border-border bg-card px-3.5 py-3",
                    "text-[12px] text-muted-foreground",
                )}
            >
                <span className="mono-eyebrow mb-1 block text-muted-foreground">
                    Recovery passphrase
                </span>
                <p className="leading-[1.5]">
                    No passphrase stored on this device. Reveal it from the device
                    that generated it, or generate a new one to replace it.
                </p>
            </div>
        )
    }

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
        <div
            className={cn(
                "rounded-[10px] border px-3.5 pb-3 pt-3.5",
                "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--chat)_10%,var(--card)),var(--card))]",
                "border-[color-mix(in_oklab,var(--chat)_28%,var(--border))]",
            )}
        >
            <div className="mb-2.5 flex items-start justify-between gap-2.5">
                <div className="min-w-0">
                    <span className="mono-eyebrow mb-[3px] block text-muted-foreground">
                        recovery passphrase · {words.length} words
                    </span>
                    <span className="font-serif text-[14.5px] font-medium tracking-[-0.005em] text-foreground">
                        {title}
                        <em className="not-italic text-chat">.</em>
                    </span>
                </div>
                <div
                    className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px]",
                        revealed
                            ? "bg-[color-mix(in_oklab,var(--chat)_18%,transparent)]"
                            : "bg-muted",
                    )}
                >
                    <span
                        className={cn(
                            "inline-block h-[5px] w-[5px] rounded-full",
                            revealed ? "animate-pulse bg-chat" : "bg-muted-foreground",
                        )}
                    />
                    <span
                        className={cn(
                            "font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em]",
                            revealed ? "text-chat" : "text-muted-foreground",
                        )}
                    >
                        {revealed ? "revealed" : "hidden"}
                    </span>
                </div>
            </div>

            {/* 6×4 word grid. Always rendered — the blur on the wrapper is
                the toggle, no remount required. */}
            <div
                className={cn(
                    "grid grid-cols-6 gap-[5px] transition-[filter,opacity] duration-200",
                    !revealed && "select-none blur-[4px] opacity-80",
                )}
                aria-hidden={!revealed}
            >
                {words.map((word, i) => (
                    <div
                        key={i}
                        className="flex min-w-0 items-center gap-[5px] rounded-[5px] border border-border bg-background px-1.5 py-1"
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

            {/* Action row */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    className={cn(
                        "inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-[5px] px-2.5",
                        "font-sans text-[11px] font-semibold",
                        revealed
                            ? "border border-border-strong bg-transparent text-foreground hover:bg-accent/40"
                            : "border border-chat bg-chat text-primary-foreground hover:opacity-90",
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
                        "inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-[5px] border border-border-strong bg-transparent px-2.5",
                        "font-sans text-[11px] text-foreground hover:bg-accent/40",
                        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                    )}
                >
                    {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                </button>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={handleClear}
                    disabled={isClearing}
                    className={cn(
                        "inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-[5px] px-2.5",
                        "font-sans text-[11px]",
                        confirmClear
                            ? "border border-destructive bg-destructive text-destructive-foreground hover:opacity-90"
                            : "border border-border-strong bg-transparent text-muted-foreground hover:text-destructive",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                >
                    <Trash2 className="h-3 w-3" />
                    {isClearing ? "Clearing…" : confirmClear ? "Confirm clear" : "Clear"}
                </button>
            </div>

            {/* Security band */}
            <div
                className={cn(
                    "mt-2.5 flex items-center gap-[7px] rounded-[6px] px-2 py-[7px]",
                    "bg-[color-mix(in_oklab,var(--warning)_7%,transparent)]",
                    "border border-[color-mix(in_oklab,var(--warning)_22%,var(--border))]",
                    "text-[10.5px] leading-[1.4] text-muted-foreground",
                )}
            >
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
                <span>
                    Anyone holding these words can sign in as you. Made here on
                    your device — we never see them.
                </span>
            </div>
        </div>
    )
}
