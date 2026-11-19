import { Check, X } from "lucide-react"
import { useEffect, useId, useRef } from "react"
import { Input, TextField } from "react-aria-components"

import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

interface InlineNameFieldProps {
    /** What a screen reader calls the field: "Device name". */
    label: string
    value: string
    /** Where a limit is enforced: the field sets none. */
    onChange: (value: string) => void
    placeholder?: string
    /** Saving: the field is read-only and busy, its buttons wait. */
    isPending?: boolean
    /** Under the field, tied to it. */
    error?: string | null
    onSave: () => void
    onCancel: () => void
    className?: string
}

/** A name in a list row, renamed in place as the header's group title is: Enter saves, Escape cancels, leaving it changes nothing. */
export function InlineNameField({
    label,
    value,
    onChange,
    placeholder,
    isPending = false,
    error = null,
    onSave,
    onCancel,
    className,
}: InlineNameFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const wasPending = useRef(isPending)
    const errorId = useId()

    useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [])

    // A save pressed on its button lost the focus as the button waited: the field takes it back.
    useEffect(() => {
        if (wasPending.current && !isPending) inputRef.current?.focus()
        wasPending.current = isPending
    }, [isPending])

    return (
        <span className={cn("flex min-w-0 flex-col", className)}>
            <span className="flex min-w-0 items-center gap-1">
                <TextField
                    aria-label={label}
                    aria-describedby={error ? errorId : undefined}
                    value={value}
                    onChange={onChange}
                    isReadOnly={isPending}
                    isInvalid={!!error}
                    validationBehavior="aria"
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            if (!isPending) onSave()
                        } else if (e.key === "Escape") {
                            if (!isPending) onCancel()
                        } else e.continuePropagation()
                    }}
                    className="min-w-0 flex-1"
                >
                    <Input
                        ref={inputRef}
                        aria-busy={isPending || undefined}
                        placeholder={placeholder}
                        className="title w-full rounded-[8px] bg-surf2 px-2 py-px text-[13.5px] font-medium text-foreground shadow-[inset_0_0_0_1.5px_var(--acc)] outline-none placeholder:text-muted-foreground read-only:opacity-60"
                    />
                </TextField>
                <IconButton
                    variant="ghost"
                    aria-label="Save name"
                    isDisabled={isPending}
                    onPress={onSave}
                    className="h-6 w-6 bg-action text-action-foreground hover:bg-action hover:text-action-foreground disabled:opacity-45"
                >
                    <Check className="h-3 w-3" />
                </IconButton>
                <IconButton variant="ghost" aria-label="Cancel" isDisabled={isPending} onPress={onCancel} className="h-6 w-6">
                    <X className="h-3 w-3" />
                </IconButton>
            </span>
            {error && (
                <span id={errorId} role="alert" className="mt-1 text-[11px] text-dnd-ink">
                    {error}
                </span>
            )}
        </span>
    )
}
