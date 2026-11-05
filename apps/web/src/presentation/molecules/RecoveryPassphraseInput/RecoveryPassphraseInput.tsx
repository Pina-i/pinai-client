import { useCallback, useMemo, useRef } from "react"

import { cn } from "@/presentation/_libs/utils"
import { RECOVERY_WORD_COUNT, WORDLIST_SET, type SlotStatus } from "./RecoveryPassphraseInput.helper"

interface RecoveryPassphraseInputProps {
    /** 24-element array. Empty string for unfilled slots. */
    value: string[]
    onChange: (next: string[]) => void
    /** Disabled while the words are being checked. */
    disabled?: boolean
}

function statusFor(word: string): SlotStatus {
    if (!word) return "empty"
    return WORDLIST_SET.has(word) ? "ok" : "unknown"
}

/**
 * 24 slots, three a row (two on a phone), each word checked against the BIP-39 list. A
 * whitespace-separated paste into any slot fans out across the following ones — most password
 * managers paste all 24 at once.
 */
export function RecoveryPassphraseInput({ value, onChange, disabled }: RecoveryPassphraseInputProps) {
    const inputRefs = useRef<Array<HTMLInputElement | null>>([])

    // Callers pass 24 entries; a shorter array is padded rather than trusted.
    const slots = useMemo(() => {
        if (value.length === RECOVERY_WORD_COUNT) return value
        const next = [...value]
        while (next.length < RECOVERY_WORD_COUNT) next.push("")
        return next.slice(0, RECOVERY_WORD_COUNT)
    }, [value])

    const updateSlot = useCallback(
        (index: number, raw: string) => {
            const next = [...slots]
            next[index] = raw.toLowerCase().trim()
            onChange(next)
        },
        [slots, onChange],
    )

    const handlePaste = useCallback(
        (e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) => {
            const tokens = e.clipboardData
                .getData("text")
                .split(/\s+/)
                .map((t) => t.toLowerCase().trim())
                .filter(Boolean)
            // One word pastes into its slot as usual.
            if (tokens.length <= 1) return
            e.preventDefault()
            const next = [...slots]
            for (let i = 0; i < tokens.length && startIndex + i < RECOVERY_WORD_COUNT; i++) {
                next[startIndex + i] = tokens[i]
            }
            onChange(next)
            inputRefs.current[Math.min(startIndex + tokens.length, RECOVERY_WORD_COUNT - 1)]?.focus()
        },
        [slots, onChange],
    )

    return (
        <div className="grid grid-cols-3 gap-1.5 max-[440px]:grid-cols-2">
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

function WordInputSlot({ index, value, status, disabled, inputRef, onChange, onPaste }: WordInputSlotProps) {
    return (
        <div
            className={cn(
                "relative flex h-[34px] min-w-0 items-center gap-1.5 rounded-[10px] border px-2 transition-[border-color,box-shadow] duration-150",
                "focus-within:shadow-[0_0_0_3px_var(--accsoft)]",
                status === "unknown"
                    ? "border-idle bg-[color-mix(in_oklab,var(--idle)_8%,var(--background))]"
                    : status === "ok"
                      ? "border-[color-mix(in_oklab,var(--acc)_30%,var(--line))] bg-[color-mix(in_oklab,var(--acc)_5%,var(--background))]"
                      : "border-line bg-surf2 focus-within:border-acc",
                disabled && "opacity-50",
            )}
        >
            <span className="min-w-[14px] shrink-0 font-mono text-[9.5px] text-muted-foreground">{index + 1}</span>
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
                aria-invalid={status === "unknown" || undefined}
                placeholder="—"
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            {status === "unknown" && (
                <span
                    className="absolute -right-[5px] -top-[5px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-idle font-mono text-[10px] font-bold text-background"
                    aria-hidden
                >
                    !
                </span>
            )}
        </div>
    )
}
