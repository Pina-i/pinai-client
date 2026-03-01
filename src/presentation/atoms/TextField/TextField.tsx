import {
    TextField as AriaTextField,
    Label,
    Input,
    type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components"

export interface TextFieldProps extends Omit<AriaTextFieldProps, "children" | "className"> {
    label?: string
    placeholder?: string
    error?: string
    className?: string
}

export function TextField({ label, placeholder, error, className, ...props }: TextFieldProps) {
    return (
        <AriaTextField
            {...props}
            isInvalid={props.isInvalid ?? !!error}
            className={["space-y-1 w-full", className].filter(Boolean).join(" ")}
        >
            {label && (
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    {label}
                </Label>
            )}
            <Input
                placeholder={placeholder}
                className={[
                    "w-full bg-background border border-input text-foreground text-sm px-3 py-2",
                    "outline-none transition-colors",
                    "focused:border-ring",
                    "invalid:border-destructive",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
            />
            {error && (
                <p className="text-destructive text-xs" role="alert">
                    {error}
                </p>
            )}
        </AriaTextField>
    )
}
