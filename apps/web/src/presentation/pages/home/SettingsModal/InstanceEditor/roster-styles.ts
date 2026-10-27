import { tv } from "tailwind-variants"

/** `.ro-row` — one line of the roster: a member, the invite row, a pending invitation. */
export const rosterRow = tv({
    base: "group flex items-center gap-3 rounded-full border border-transparent px-3 py-2 transition-colors duration-150 hover:bg-surf2",
    variants: {
        open: { true: "border-acc-line bg-acc-soft hover:bg-acc-soft" },
        /** The invite row and the pending invitations: seats not taken yet. */
        dashed: { true: "border-dashed border-line2" },
    },
})

export const rosterText = "flex min-w-0 flex-1 flex-col"
export const rosterName = "title flex items-center gap-2 text-[14px] font-medium leading-[1.15] text-foreground"
export const rosterLine = "truncate font-mono text-[10px] text-muted-foreground [font-variant-ligatures:none]"

export const dashedAvatar =
    "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-dashed border-line2 text-muted-foreground"

/** A row's action: shown on hover and focus, always where nothing hovers, and while its row is open. */
export const revealed = tv({
    base: "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
    variants: { open: { true: "opacity-100" } },
})

/** `.ro-exp` — what an open row unfolds into, under it. */
export const expansion = [
    "mb-2 ml-[42px] mt-1 flex flex-col gap-3 rounded-[16px] border border-acc-line px-4 py-3.5",
    "bg-[color-mix(in_oklab,var(--acc)_6%,var(--surf))] @max-[380px]:ml-0",
    "animate-in fade-in-0 zoom-in-[0.97] duration-200 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:animate-none",
].join(" ")

export const expansionText = "m-0 text-pretty text-[13px] leading-[1.55] text-foreground"

/** A row action's label, dropped when the panel is narrow: its icon and accessible name stay. */
export const actionLabel = "@max-[380px]:hidden"
