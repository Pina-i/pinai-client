import { tv } from "tailwind-variants"

/** The popover's pill buttons: a row's Add or Accept, the found card's, "Copy address". */
export const actionButton = tv({
    base: "h-[30px] shrink-0 gap-1.5 px-3 text-[12.5px] [&_svg]:h-[13px] [&_svg]:w-[13px]",
    variants: {
        prominent: {
            true: "font-semibold shadow-none",
            false: "font-medium hover:bg-surf3 hover:opacity-100",
        },
    },
    defaultVariants: { prominent: false },
})
