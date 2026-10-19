import {
    TextField as AriaTextField,
    Label,
    Input,
    type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components"
import type { ReactNode } from "react"
import { cn } from "@/presentation/_libs/utils"

export interface TextFieldProps extends Omit<AriaTextFieldProps, "children" | "className"> {
    label?: string
    placeholder?: string
    error?: string
    icon?: ReactNode
    /** After the input, e.g. the check of a resolved address. */
    trailing?: ReactNode
    /** Mono input, for addresses. */
    mono?: boolean
    /** The value is accepted (an address resolved): the accent border and icons, as on focus. */
    valid?: boolean
    className?: string
}

export function TextField({ label, placeholder, error, icon, trailing, mono, valid, className, ...props }: TextFieldProps) {
    return (
        <AriaTextField
            {...props}
            isInvalid={props.isInvalid ?? !!error}
            className={cn("group w-full", className)}
        >
            {label && <Label className="eye mb-1.5 block">{label}</Label>}
            <div
                className={cn(
                    "flex h-[42px] items-center gap-[9px] rounded-[12px] border border-line bg-surf2 px-3.5",
                    "text-[12px] text-muted-foreground transition-colors duration-150",
                    // On this plain div, not the group: React Aria's TextField sets no `data-focus-within`.
                    "focus-within:border-acc focus-within:shadow-[0_0_0_3px_var(--accsoft)]",
                    "group-data-[invalid]:border-destructive",
                    "group-data-[disabled]:cursor-not-allowed group-data-[disabled]:opacity-50",
                    valid && "border-acc text-acc",
                )}
            >
                {icon && <span className="pointer-events-none flex shrink-0">{icon}</span>}
                <Input
                    placeholder={placeholder}
                    className={cn(
                        "min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none",
                        mono && "font-mono text-[12px] [font-variant-ligatures:none]",
                    )}
                />
                {trailing && <span className="pointer-events-none flex shrink-0">{trailing}</span>}
            </div>
            {error && (
                <p className="mt-1.5 text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </AriaTextField>
    )
}
