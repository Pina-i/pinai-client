import { Plus } from "lucide-react"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

interface NewGroupButtonProps {
    /** The group composer is open: the three dots stay lit. */
    isOpen: boolean
    onPress: () => void
}

/** One dot of the trio, muted at rest, in its own colour when hovered, focused or open. */
const dot =
    "absolute h-2.5 w-2.5 rounded-full shadow-[0_0_0_1.5px_var(--surf)] transition-[background-color] duration-150"

/** Three people, one per colour of the palette, and a plus: the "New group" button beside Direct Messages. */
export function NewGroupButton({ isOpen, onPress }: NewGroupButtonProps) {
    return (
        <IconButton
            aria-label="New group"
            onPress={onPress}
            className={cn(
                "group relative h-7 w-7 shrink-0 rounded-full transition-[background-color] duration-150",
                isOpen ? "bg-acc-soft shadow-[inset_0_0_0_1px_var(--accline)]" : "hover:bg-surf3",
            )}
        >
            <i
                className={cn(
                    dot,
                    "left-[5px] top-1.5",
                    isOpen
                        ? "bg-acc"
                        : "bg-[color-mix(in_oklab,var(--acc)_55%,var(--muted-foreground))] group-hover:bg-acc group-focus-visible:bg-acc",
                )}
            />
            <i
                className={cn(
                    dot,
                    "left-[13px] top-1.5",
                    isOpen
                        ? "bg-sec"
                        : "bg-[color-mix(in_oklab,var(--sec)_55%,var(--muted-foreground))] group-hover:bg-sec group-focus-visible:bg-sec",
                )}
            />
            <i
                className={cn(
                    dot,
                    "left-[9px] top-[13px]",
                    isOpen
                        ? "bg-action"
                        : "bg-[color-mix(in_oklab,var(--action)_55%,var(--muted-foreground))] group-hover:bg-action group-focus-visible:bg-action",
                )}
            />
            <b className="absolute bottom-0.5 right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-foreground text-background">
                <Plus className="h-[7px] w-[7px]" strokeWidth={3.4} aria-hidden="true" />
            </b>
        </IconButton>
    )
}
