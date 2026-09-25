import { Link as AriaLink, type LinkProps as AriaLinkProps } from "react-aria-components"

export interface LinkProps extends Omit<AriaLinkProps, "className"> {
    className?: string
}

export function Link({ className, ...props }: LinkProps) {
    return (
        <AriaLink
            className={[
                "text-sm text-acc underline underline-offset-2 cursor-pointer",
                "outline-none transition-opacity",
                "hover:opacity-80 pressed:opacity-60",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            {...props}
        />
    )
}
