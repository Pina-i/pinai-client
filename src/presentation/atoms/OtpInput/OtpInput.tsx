import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { cn } from "@/presentation/_libs/utils"

export interface OtpInputProps {
    value: string
    onChange: (value: string) => void
    onComplete?: (value: string) => void
    length?: number
    name?: string
    label?: string
    error?: string
    autoFocus?: boolean
    disabled?: boolean
    className?: string
}

/**
 * Editorial 6-digit OTP input. Each cell renders a Fraunces serif glyph when
 * filled, a blinking caret when focused, and a small horizontal dash mark when
 * empty. A static dash separates the 3rd and 4th cells (phone-number rhythm).
 */
export function OtpInput({
    value,
    onChange,
    onComplete,
    length = 6,
    name,
    label,
    error,
    autoFocus,
    disabled,
    className,
}: OtpInputProps) {
    const id = useId()
    const refs = useRef<Array<HTMLInputElement | null>>([])
    const [focusIndex, setFocusIndex] = useState<number | null>(autoFocus ? 0 : null)
    const cells = Array.from({ length }, (_, i) => value[i] ?? "")

    useEffect(() => {
        if (autoFocus) refs.current[0]?.focus()
    }, [autoFocus])

    function setDigit(index: number, digit: string) {
        const next = cells.slice()
        next[index] = digit
        const joined = next.join("")
        onChange(joined)
        if (joined.length === length && !joined.includes("") && onComplete) {
            onComplete(joined)
        }
    }

    function distributeFrom(start: number, digits: string) {
        const next = cells.slice()
        let i = start
        for (const d of digits) {
            if (i >= length) break
            next[i++] = d
        }
        const joined = next.join("")
        onChange(joined)
        refs.current[Math.min(i, length - 1)]?.focus()
        if (joined.length === length && !joined.includes("") && onComplete) {
            onComplete(joined)
        }
    }

    function handleChange(index: number, raw: string) {
        const clean = raw.replace(/\D/g, "")
        if (!clean) {
            setDigit(index, "")
            return
        }
        if (clean.length > 1) {
            distributeFrom(index, clean)
            return
        }
        setDigit(index, clean[0])
        refs.current[index + 1]?.focus()
    }

    function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Backspace") {
            if (cells[index]) {
                setDigit(index, "")
                return
            }
            // Empty cell — jump back and clear the previous one for fast erase.
            if (index > 0) {
                e.preventDefault()
                refs.current[index - 1]?.focus()
                setDigit(index - 1, "")
            }
            return
        }
        if (e.key === "ArrowLeft" && index > 0) {
            e.preventDefault()
            refs.current[index - 1]?.focus()
        }
        if (e.key === "ArrowRight" && index < length - 1) {
            e.preventDefault()
            refs.current[index + 1]?.focus()
        }
    }

    function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
        const text = e.clipboardData.getData("text").replace(/\D/g, "")
        if (!text) return
        e.preventDefault()
        distributeFrom(index, text)
    }

    const renderCell = (i: number) => {
        const digit = cells[i]
        const focused = focusIndex === i
        const filled = !!digit
        return (
            <div key={i} className="relative">
                <input
                    ref={(el) => {
                        refs.current[i] = el
                    }}
                    id={`${id}-${i}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={digit}
                    disabled={disabled}
                    aria-invalid={!!error}
                    aria-label={`Digit ${i + 1} of ${length}`}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={(e) => handlePaste(i, e)}
                    onFocus={(e) => {
                        setFocusIndex(i)
                        e.currentTarget.select()
                    }}
                    onBlur={() => setFocusIndex((cur) => (cur === i ? null : cur))}
                    className={cn(
                        "h-[54px] w-[46px] rounded-[var(--radius)] border bg-background text-center outline-none transition-[border-color,box-shadow,background] duration-150",
                        "[font-family:var(--font-serif)] text-[26px] font-normal",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        // The overlay renders the visible glyph — hide the
                        // native value so the empty/focus/filled treatment is
                        // consistent across browsers.
                        "caret-transparent text-transparent",
                    )}
                    style={{
                        borderColor: error
                            ? "var(--destructive)"
                            : focused
                              ? "var(--chat)"
                              : filled
                                ? "color-mix(in oklab, var(--chat) 30%, var(--border-strong))"
                                : "var(--border-strong)",
                        backgroundColor: error
                            ? "color-mix(in oklab, var(--destructive) 6%, var(--background))"
                            : filled
                              ? "color-mix(in oklab, var(--chat) 5%, var(--background))"
                              : "var(--background)",
                        boxShadow: focused
                            ? "0 0 0 3px color-mix(in oklab, var(--chat) 18%, transparent)"
                            : "none",
                    }}
                />
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: 26,
                        color: error ? "var(--destructive)" : "var(--foreground)",
                    }}
                >
                    {filled ? (
                        digit
                    ) : focused ? (
                        <span
                            className="rounded-[1px]"
                            style={{
                                width: 1.5,
                                height: 24,
                                background: "var(--chat)",
                                animation: "pn-blink 1s steps(2) infinite",
                            }}
                        />
                    ) : (
                        <span
                            className="rounded-[1px]"
                            style={{
                                width: 14,
                                height: 1.5,
                                background: "var(--border-strong)",
                            }}
                        />
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className={cn("w-full", className)}>
            {label && (
                <label
                    htmlFor={`${id}-0`}
                    className="mono-eyebrow mb-2.5 block text-muted-foreground uppercase"
                >
                    {label}
                </label>
            )}
            <div className="flex items-center gap-2" role="group" aria-label={label ?? "One-time passcode"}>
                {renderCell(0)}
                {renderCell(1)}
                {renderCell(2)}
                <span
                    aria-hidden
                    className="mx-0.5 rounded-[1px]"
                    style={{
                        width: 14,
                        height: 1.5,
                        background: "var(--border-strong)",
                    }}
                />
                {renderCell(3)}
                {renderCell(4)}
                {renderCell(5)}
            </div>
            {name && <input type="hidden" name={name} value={value} />}
            {error && (
                <p className="mt-2 text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    )
}
