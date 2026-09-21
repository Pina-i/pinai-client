import { useCallback, useImperativeHandle, useMemo, useRef, type RefObject } from "react"

import { cn } from "@/presentation/_libs/utils"
import {
    RECOVERY_WORD_COUNT,
    WORDLIST_SET,
    type SlotStatus,
} from "./RecoveryPassphraseInput.helper"

/** Imperative actions exposed via `handleRef`. */
export interface RecoveryPassphraseInputHandle {
    /** Focus the first slot so a subsequent Ctrl/Cmd-V paste-fans across all 24. */
    focusFirstSlot: () => void
}

interface RecoveryPassphraseInputProps {
    /** 24-element array. Empty string for unfilled slots. */
    value: string[]
    onChange: (next: string[]) => void
    /** Optional disable — used by the degraded "Start fresh only" variant. */
    disabled?: boolean
    handleRef?: RefObject<RecoveryPassphraseInputHandle | null>
}

/** Per-word status — drives the slot's border/badge styling. */
function statusFor(word: string): SlotStatus {
    if (!word) return "empty"
    return WORDLIST_SET.has(word) ? "ok" : "unknown"
}

/**
 * 24-slot input for the "Recover history" onboarding view. Mirrors
 * the `WordSlot` design in `web-client/design/screens/security.jsx`:
 * mono-font slots, leading 2-digit index, per-word BIP-39 validation
 * (warning badge on unknown, check on ok).
 *
 * Paste support: when the user pastes whitespace-separated text into
 * any slot, the input fans it out across all slots (up to 24). This
 * matches the "Paste passphrase" CTA on the page — most password
 * managers paste all 24 at once.
 */
export function RecoveryPassphraseInput({
    value,
    onChange,
    disabled,
    handleRef,
}: RecoveryPassphraseInputProps) {
    const inputRefs = useRef<Array<HTMLInputElement | null>>([])

    useImperativeHandle(
        handleRef,
        () => ({
            focusFirstSlot: () => inputRefs.current[0]?.focus(),
        }),
        [],
    )

    // Defensive normalisation: callers should pass exactly 24 entries
    // but we tolerate shorter arrays by padding with "".
    const slots = useMemo(() => {
        if (value.length === RECOVERY_WORD_COUNT) return value
        const next = [...value]
        while (next.length < RECOVERY_WORD_COUNT) next.push("")
        return next.slice(0, RECOVERY_WORD_COUNT)
    }, [value])

    const filledCount = useMemo(
        () => slots.reduce((n, w) => (w ? n + 1 : n), 0),
        [slots],
    )

    const updateSlot = useCallback(
        (index: number, raw: string) => {
            const next = [...slots]
            // Lower-case + trim. BIP-39 English is all-lowercase.
            next[index] = raw.toLowerCase().trim()
            onChange(next)
        },
        [slots, onChange],
    )

    const handlePaste = useCallback(
        (e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) => {
            const raw = e.clipboardData.getData("text")
            const tokens = raw
                .split(/\s+/)
                .map((t) => t.toLowerCase().trim())
                .filter(Boolean)
            // Single word → let the default paste behaviour handle it
            // (lets the user paste one word into one slot normally).
            if (tokens.length <= 1) return
            e.preventDefault()
            const next = [...slots]
            for (let i = 0; i < tokens.length && startIndex + i < RECOVERY_WORD_COUNT; i++) {
                next[startIndex + i] = tokens[i]
            }
            onChange(next)
            // Focus the last filled slot (or the last slot when all 24 land).
            const focusTarget = Math.min(
                startIndex + tokens.length,
                RECOVERY_WORD_COUNT - 1,
            )
            inputRefs.current[focusTarget]?.focus()
        },
        [slots, onChange],
    )

    return (
        <div
            className={cn(
                "rounded-[var(--radius)] border border-border-strong bg-card px-5 py-4",
                "shadow-[0_12px_30px_-10px_rgba(0,0,0,0.4)]",
            )}
        >
            <div className="mb-3.5 flex items-center justify-between">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                    Your passphrase · {RECOVERY_WORD_COUNT} words
                </span>
                <span
                    className={cn(
                        "rounded-[4px] px-1.5 py-[1.5px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]",
                        filledCount === RECOVERY_WORD_COUNT
                            ? "bg-[color-mix(in_oklab,var(--success)_22%,transparent)] text-success"
                            : "bg-muted text-muted-foreground",
                    )}
                >
                    {filledCount} / {RECOVERY_WORD_COUNT}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-x-2.5 gap-y-2">
                {slots.map((word, i) => {
                    const status = statusFor(word)
                    return (
                        <WordInputSlot
                            key={i}
                            index={i}
                            value={word}
                            status={status}
                            disabled={disabled}
                            inputRef={(el) => {
                                inputRefs.current[i] = el
                            }}
                            onChange={(raw) => updateSlot(i, raw)}
                            onPaste={(e) => handlePaste(e, i)}
                        />
                    )
                })}
            </div>

            <div
                className={cn(
                    "mt-3.5 flex items-center gap-2 rounded-[8px] bg-muted px-3 py-2.5",
                    "font-mono text-[11.5px] text-muted-foreground",
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
                >
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <span>Words are checked here on this device. We never see them.</span>
            </div>
        </div>
    )
}

interface WordInputSlotProps {
    index: number
    value: string
    status: SlotStatus
    disabled?: boolean
    inputRef: (el: HTMLInputElement | null) => void
    onChange: (raw: string) => void
    onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void
}

function WordInputSlot({
    index,
    value,
    status,
    disabled,
    inputRef,
    onChange,
    onPaste,
}: WordInputSlotProps) {
    const borderClass =
        status === "unknown"
            ? "border-warning"
            : status === "ok"
              ? "border-[color-mix(in_oklab,var(--chat)_30%,var(--border))]"
              : "border-border focus-within:border-chat"
    const bgClass =
        status === "unknown"
            ? "bg-[color-mix(in_oklab,var(--warning)_8%,var(--background))]"
            : status === "ok"
              ? "bg-[color-mix(in_oklab,var(--chat)_5%,var(--background))]"
              : "bg-background"
    return (
        <div
            className={cn(
                "relative flex items-center gap-2 rounded-[7px] border px-2.5 py-2",
                "focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--chat)_16%,transparent)]",
                borderClass,
                bgClass,
                disabled && "opacity-50",
            )}
        >
            <span
                className={cn(
                    "w-[18px] shrink-0 text-right",
                    "font-mono text-[10px] tracking-[0.06em] text-muted-foreground",
                )}
            >
                {String(index + 1).padStart(2, "0")}
            </span>
            <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={disabled}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onPaste={onPaste}
                aria-label={`Recovery word ${index + 1}`}
                placeholder="—"
                className={cn(
                    "min-w-0 flex-1 bg-transparent outline-none",
                    "font-mono text-[13px] font-medium text-foreground",
                    "placeholder:italic placeholder:text-[color-mix(in_oklab,var(--muted-foreground)_60%,transparent)]",
                )}
            />
            {status === "unknown" && (
                <span
                    className={cn(
                        "absolute -right-[5px] -top-[5px] flex h-[14px] w-[14px] items-center justify-center rounded-full",
                        "bg-warning text-background font-mono text-[10px] font-bold",
                    )}
                    aria-label="Not a valid BIP-39 word"
                >
                    !
                </span>
            )}
            {status === "ok" && (
                <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--chat)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                    aria-hidden
                >
                    <path d="M5 12l5 5 9-11" />
                </svg>
            )}
        </div>
    )
}
