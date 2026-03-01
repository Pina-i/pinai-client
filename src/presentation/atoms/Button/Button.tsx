import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { tv, type VariantProps } from "tailwind-variants"

const buttonVariants = tv({
    base: [
        "inline-flex items-center justify-center",
        "text-sm font-semibold cursor-pointer",
        "outline-none transition-opacity",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
    ].join(" "),
    variants: {
        variant: {
            primary: [
                "w-full bg-primary text-primary-foreground py-2.5 px-4",
                "hover:opacity-90 pressed:opacity-80",
                "shadow-sm",
            ].join(" "),
            ghost: [
                "text-muted-foreground hover:text-foreground",
                "underline underline-offset-2",
                "pressed:opacity-70",
            ].join(" "),
        },
    },
    defaultVariants: {
        variant: "primary",
    },
})

type ButtonVariantProps = VariantProps<typeof buttonVariants>

export interface ButtonProps extends Omit<AriaButtonProps, "className"> {
    variant?: ButtonVariantProps["variant"]
    className?: string
}

export function Button({ variant, className, ...props }: ButtonProps) {
    return (
        <AriaButton
            className={buttonVariants({ variant, className })}
            {...props}
        />
    )
}
