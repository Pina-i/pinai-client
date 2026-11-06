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
    /** A dash after every `groupSize` cells: 3 shows a code as 3 + 3. */
    groupSize?: number
    size?: "sm" | "md" | "lg"
    /** The label beside the cells, wrapping under it when the row runs out. */
    inline?: boolean
}

/** Six single-digit mono cells; typing advances, paste fans out, backspace walks back. */
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
    groupSize,
    size = "md",
    inline = false,
}: OtpInputProps) {
    const id = useId()
    const refs = useRef<Array<HTMLInputElement | null>>([])
    // The value holds digits only: a cell emptied between two others lives here while the value is still what it gave.
    const [held, setHeld] = useState<string[]>(() => cellsOf(value, length))
    const cells = held.length === length && held.join("") === value ? held : cellsOf(value, length)

    useEffect(() => {
        if (autoFocus) refs.current[0]?.focus()
    }, [autoFocus])

    // Fired after commit, not from the keystroke: callers read the code from
    // their own state or the form's hidden input, which only hold all six
    // digits once the parent has re-rendered.
    const firedFor = useRef<string | null>(value)
    useEffect(() => {
        if (value.length !== length) {
            firedFor.current = null
            return
        }
        if (firedFor.current === value) return
        firedFor.current = value
        onComplete?.(value)
    }, [value, length, onComplete])

    function commit(next: string[]) {
        setHeld(next)
        onChange(next.join(""))
    }

    function setDigit(index: number, digit: string) {
        const next = cells.slice()
        next[index] = digit
        commit(next)
    }

    function distributeFrom(start: number, digits: string) {
        const next = cells.slice()
        let i = start
        for (const d of digits) {
            if (i >= length) break
            next[i++] = d
        }
        commit(next)
        refs.current[Math.min(i, length - 1)]?.focus()
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
        return (
            <input
                key={i}
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
                onFocus={(e) => e.currentTarget.select()}
                className={cn(
                    "rounded-[12px] border bg-surf2 text-center font-mono text-foreground outline-none",
                    size === "lg"
                        ? "h-14 w-[46px] text-[22px] max-[520px]:h-12 max-[520px]:w-10 max-[520px]:text-[19px]"
                        : size === "sm"
                          ? "h-10 w-[34px] rounded-[10px] text-[16px]"
                          : "h-[46px] w-10 text-[18px]",
                    "transition-[border-color,box-shadow] duration-150",
                    "focus:border-acc focus:shadow-[0_0_0_3px_var(--accsoft)]",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    error
                        ? "border-dnd focus:border-dnd focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--dnd)_18%,transparent)]"
                        : digit
                          ? "border-[color-mix(in_oklab,var(--acc)_30%,var(--line2))]"
                          : "border-line2",
                )}
            />
        )
    }

    const gap = size === "sm" ? "gap-1.5" : "gap-2"
    return (
        <div className={cn(inline ? "flex flex-wrap items-center gap-x-3.5 gap-y-2" : "w-full", className)}>
            {label && (
                <label
                    htmlFor={`${id}-0`}
                    className={inline ? "text-[12px] text-muted-foreground" : "eye mb-1.5 block"}
                >
                    {label}
                </label>
            )}
            <div className={cn("flex items-center", gap)} role="group" aria-label={label ?? "One-time passcode"}>
                {cells.map((_, i) =>
                    groupSize && i > 0 && i % groupSize === 0 ? (
                        <span key={`group-${i}`} className={cn("flex items-center", gap)}>
                            <span aria-hidden className="h-0.5 w-2 rounded-full bg-line2" />
                            {renderCell(i)}
                        </span>
                    ) : (
                        renderCell(i)
                    ),
                )}
            </div>
            {name && <input type="hidden" name={name} value={value} />}
            {error && (
                <p className="mt-2 text-xs text-dnd" role="alert">
                    {error}
                </p>
            )}
        </div>
    )
}

function cellsOf(value: string, length: number): string[] {
    return Array.from({ length }, (_, i) => value[i] ?? "")
}
