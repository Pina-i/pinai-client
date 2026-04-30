import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { tv, type VariantProps } from "tailwind-variants"

const buttonVariants = tv({
    base: [
        "inline-flex items-center justify-center",
        "cursor-pointer outline-none",
        "transition-opacity",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
    ].join(" "),
    variants: {
        variant: {
            primary: [
                "w-full py-3 px-3.5 rounded-[var(--radius)]",
                "bg-primary text-primary-foreground",
                "text-[13.5px] font-semibold tracking-[0.005em]",
                "shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_24px_-8px_color-mix(in_oklab,var(--primary)_40%,transparent)]",
                "hover:opacity-90 pressed:opacity-80",
            ].join(" "),
            secondary: [
                "w-full py-[11px] px-3.5 rounded-[var(--radius)]",
                "bg-transparent text-foreground",
                "border border-border-strong",
                "text-[13px]",
                "hover:bg-accent/40 pressed:bg-accent/60",
            ].join(" "),
            destructive: [
                "w-full py-3 px-3.5 rounded-[var(--radius)]",
                "bg-destructive text-destructive-foreground",
                "text-[13.5px] font-semibold tracking-[0.005em]",
                "hover:opacity-90 pressed:opacity-80",
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
