import { tv } from "tailwind-variants"

/** Scrolling frame every drill-in editor sits in. */
export const editorFrame =
    "flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-[30px] max-[1040px]:px-5 max-[1040px]:py-6"

export const editorTitle = "title text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-foreground"

/** Mono field label ("Display name", "Authenticator code"). */
export const fieldLabel = "mb-[5px] block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground"

export const pill = tv({
    base: [
        "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border font-sans outline-none",
        "transition-[background-color,color,opacity] duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
    ].join(" "),
    variants: {
        variant: {
            /** `.pf-btn` — small outlined pill. */
            outline: "border-line2 bg-transparent px-3 py-[5px] text-[11.5px] text-foreground hover:bg-surf2",
            /** `.pf-btn--bare` — borderless, muted until hovered. */
            bare: "border-transparent bg-transparent px-3 py-[5px] text-[11.5px] text-muted-foreground hover:text-foreground",
            /** `.pf-cancel` */
            cancel: "border-line2 bg-transparent px-3 py-2 text-[12px] text-foreground hover:bg-surf2",
            /** `.pf-save` — what you commit. */
            save: "border-transparent bg-action px-4 py-2 text-[12px] font-semibold text-action-foreground hover:opacity-90",
            /** Destructive commit (disable 2FA). */
            danger: "border-transparent bg-dnd px-4 py-2 text-[12px] font-semibold text-background hover:opacity-90",
        },
    },
    defaultVariants: { variant: "cancel" },
})
