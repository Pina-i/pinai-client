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
    className?: string
}

export function TextField({ label, placeholder, error, icon, className, ...props }: TextFieldProps) {
    return (
        <AriaTextField
            {...props}
            isInvalid={props.isInvalid ?? !!error}
            className={cn("group w-full", className)}
        >
            {label && (
                <Label className="mono-eyebrow mb-1.5 block text-muted-foreground uppercase">
                    {label}
                </Label>
            )}
            <div
                className={cn(
                    "flex h-[42px] items-center gap-2.5 rounded-[var(--radius)] border border-border bg-input px-3 transition-colors",
                    "group-focus-within:border-ring",
                    "group-data-[invalid]:border-destructive",
                    "group-data-[disabled]:cursor-not-allowed group-data-[disabled]:opacity-50",
                )}
            >
                {icon && (
                    <span className="shrink-0 text-muted-foreground pointer-events-none">
                        {icon}
                    </span>
                )}
                <Input
                    placeholder={placeholder}
                    className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-muted-foreground outline-none"
                />
            </div>
            {error && (
                <p className="mt-1.5 text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </AriaTextField>
    )
}
