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
            className={cn("space-y-1 w-full", className)}
        >
            {label && (
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    {label}
                </Label>
            )}
            <div className="relative">
                {icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {icon}
                    </div>
                )}
                <Input
                    placeholder={placeholder}
                    className={cn(
                        "w-full bg-background border border-input text-foreground text-sm py-2",
                        icon ? "pl-9 pr-3" : "px-3",
                        "outline-none transition-colors",
                        "focused:border-ring",
                        "invalid:border-destructive",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                />
            </div>
            {error && (
                <p className="text-destructive text-xs" role="alert">
                    {error}
                </p>
            )}
        </AriaTextField>
    )
}
