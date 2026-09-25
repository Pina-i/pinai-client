import { useCallback, useImperativeHandle, useMemo, useRef, type RefObject } from "react"

import { Check, LockKeyhole } from "lucide-react"

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
 * 24-slot recovery input with per-word BIP-39 validation. A whitespace-separated
 * paste into any slot fans out across the following slots — most password
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
        <div className="rounded-[18px] border border-line bg-surf px-5 pb-4 pt-[18px] backdrop-blur-[14px]">
            <div className="mb-3.5 flex items-center justify-between">
                <span className="fact">Your passphrase · {RECOVERY_WORD_COUNT} words</span>
                <span
                    className={cn(
                        "rounded-full px-2 py-[3px] font-mono text-[8.5px] font-medium uppercase tracking-[0.1em]",
                        filledCount === RECOVERY_WORD_COUNT
                            ? "bg-[color-mix(in_oklab,var(--on)_18%,transparent)] text-on"
                            : "bg-surf3 text-muted-foreground",
                    )}
                >
                    {filledCount} / {RECOVERY_WORD_COUNT}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
                {slots.map((word, i) => (
                    <WordInputSlot
                        key={i}
                        index={i}
                        value={word}
                        status={statusFor(word)}
                        disabled={disabled}
                        inputRef={(el) => {
                            inputRefs.current[i] = el
                        }}
                        onChange={(raw) => updateSlot(i, raw)}
                        onPaste={(e) => handlePaste(e, i)}
                    />
                ))}
            </div>

            <div className="mt-3.5 flex items-center gap-2 rounded-[10px] border border-line bg-surf2 px-2.5 py-2 text-[11px] leading-[1.4] text-muted-foreground">
                <LockKeyhole className="h-3 w-3 shrink-0 text-acc" />
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
    return (
        <div
            className={cn(
                "relative flex min-w-0 items-center gap-2 rounded-[7px] border px-2.5 py-2 transition-[border-color,box-shadow] duration-150",
                "focus-within:shadow-[0_0_0_3px_var(--accsoft)]",
                status === "unknown"
                    ? "border-idle bg-[color-mix(in_oklab,var(--idle)_8%,var(--background))]"
                    : status === "ok"
                      ? "border-[color-mix(in_oklab,var(--acc)_30%,var(--line))] bg-[color-mix(in_oklab,var(--acc)_5%,var(--background))]"
                      : "border-line bg-background focus-within:border-acc",
                disabled && "opacity-50",
            )}
        >
            <span className="w-4 shrink-0 text-right font-mono text-[8.5px] tracking-[0.05em] text-muted-foreground">
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
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            {status === "unknown" && (
                <span
                    className="absolute -right-[5px] -top-[5px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-idle font-mono text-[10px] font-bold text-background"
                    aria-label="Not a valid BIP-39 word"
                >
                    !
                </span>
            )}
            {status === "ok" && <Check className="h-[11px] w-[11px] shrink-0 text-acc" strokeWidth={3} aria-hidden />}
        </div>
    )
}
