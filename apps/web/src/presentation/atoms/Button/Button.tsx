import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { tv, type VariantProps } from "tailwind-variants"

const buttonVariants = tv({
    base: [
        "inline-flex items-center justify-center gap-2 whitespace-nowrap",
        "cursor-pointer outline-none",
        "transition-[opacity,background-color] duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:opacity-50 disabled:cursor-not-allowed",
    ].join(" "),
    variants: {
        variant: {
            primary: [
                "rounded-full border border-transparent",
                "bg-action text-action-foreground text-[13.5px] font-bold",
                "shadow-[0_10px_26px_-10px_color-mix(in_oklab,var(--action)_70%,transparent)]",
                "hover:opacity-90 pressed:opacity-80",
            ].join(" "),
            secondary: [
                "rounded-full border border-line2",
                "bg-surf2 text-foreground text-[13.5px]",
                "hover:opacity-90 pressed:opacity-80",
            ].join(" "),
            destructive: [
                "rounded-full border border-[color-mix(in_oklab,var(--dnd)_40%,transparent)]",
                "bg-[color-mix(in_oklab,var(--dnd)_14%,transparent)] text-dnd text-[13.5px]",
                "hover:opacity-90 pressed:opacity-80",
            ].join(" "),
            ghost: [
                "text-muted-foreground hover:text-foreground",
                "underline underline-offset-2",
                "pressed:opacity-70",
            ].join(" "),
        },
        size: {
            /** Full-width form button. */
            block: "w-full p-3",
            /** Content-width button, e.g. in a modal footer. */
            inline: "w-auto px-[18px] py-2.5",
            none: "",
        },
    },
    compoundVariants: [{ variant: "ghost", class: "w-auto p-0" }],
    defaultVariants: {
        variant: "primary",
        size: "block",
    },
})

type ButtonVariantProps = VariantProps<typeof buttonVariants>

export interface ButtonProps extends Omit<AriaButtonProps, "className"> {
    variant?: ButtonVariantProps["variant"]
    size?: ButtonVariantProps["size"]
    className?: string
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
    return (
        <AriaButton
            className={buttonVariants({ variant, size, className })}
            {...props}
        />
    )
}
