import { tv } from "tailwind-variants"

/** Scrolling frame every drill-in editor sits in. */
export const editorFrame =
    "flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-[30px] max-[1040px]:px-5 max-[1040px]:py-6"

export const editorTitle = "title text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-foreground"

/** Mono field label ("Display name", "Authenticator code"). */
export const fieldLabel = "mb-[5px] block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground"

/** `.pf-in` — a one-line field, or a select. */
export const textInput = [
    "h-9 w-full rounded-[12px] border border-line bg-surf2 px-3",
    "font-sans text-[13px] text-foreground outline-none transition-colors duration-150",
    "focus-visible:border-acc",
].join(" ")

/** `.pf-bio` — the box a textarea sits in. */
export const textArea =
    "min-h-[72px] rounded-[12px] border border-line bg-surf2 px-3 py-2.5 transition-colors duration-150 focus-within:border-acc"

export const textAreaInput = [
    "title w-full resize-none bg-transparent text-[13px] italic leading-[1.5] text-foreground outline-none",
    "placeholder:not-italic placeholder:text-muted-foreground",
].join(" ")

/** `.pf-count` — what a field holds against its limit. */
export const fieldCount = "mt-[5px] text-right font-mono text-[10px] text-muted-foreground"

/** `.pf-hint` */
export const fieldHint = "mt-[5px] font-mono text-[10px] text-muted-foreground"

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
            /** `.dv-rev` — revoking something listed: a device, an invitation. */
            revoke: "h-7 shrink-0 border-dnd bg-transparent px-[11px] text-[11px] text-dnd hover:bg-[color-mix(in_oklab,var(--dnd)_10%,transparent)]",
        },
    },
    defaultVariants: { variant: "cancel" },
})
