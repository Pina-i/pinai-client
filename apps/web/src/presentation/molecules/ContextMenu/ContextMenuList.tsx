import type { ReactNode } from "react"
import { Menu as AriaMenu, MenuItem as AriaMenuItem, Separator } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

export interface ContextMenuAction {
    key: string
    label: ReactNode
    icon?: ReactNode
    /** Right-aligned keyboard hint, e.g. "⌘C". */
    hint?: ReactNode
    variant?: "default" | "destructive"
    isDisabled?: boolean
    onAction?: () => void
}

export type ContextMenuItem = ContextMenuAction | { type: "separator"; key: string }

interface ContextMenuListProps {
    items: ContextMenuItem[]
    /** Accessible label for the menu. */
    label: string
    /** Called after an item is selected, so the surrounding popover can close. */
    onClose?: () => void
    /** Menu width in px. Defaults to the design's 236. */
    width?: number
}

function isSeparator(item: ContextMenuItem): item is { type: "separator"; key: string } {
    return "type" in item && item.type === "separator"
}

/** Vertical, keyboard-navigable action list; drop it inside a `ContextMenu`. */
export function ContextMenuList({ items, label, onClose, width = 236 }: ContextMenuListProps) {
    return (
        <AriaMenu aria-label={label} onClose={onClose} style={{ width }} className="p-1.5 outline-none">
            {items.map((item) =>
                isSeparator(item) ? (
                    <Separator key={item.key} className="mx-1 my-1.5 h-px bg-line" />
                ) : (
                    <AriaMenuItem
                        key={item.key}
                        id={item.key}
                        isDisabled={item.isDisabled}
                        onAction={item.onAction}
                        className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] outline-none transition-colors duration-100",
                            item.variant === "destructive"
                                ? "text-dnd hover:bg-[color-mix(in_oklab,var(--dnd)_12%,transparent)] focus:bg-[color-mix(in_oklab,var(--dnd)_12%,transparent)]"
                                : "text-foreground hover:bg-surf2 focus:bg-surf2",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                    >
                        {item.icon && (
                            <span
                                className={cn(
                                    "flex shrink-0",
                                    item.variant !== "destructive" && "text-muted-foreground",
                                )}
                            >
                                {item.icon}
                            </span>
                        )}
                        <span className="flex-1">{item.label}</span>
                        {item.hint && (
                            <span className="rounded-[6px] bg-surf2 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                                {item.hint}
                            </span>
                        )}
                    </AriaMenuItem>
                ),
            )}
        </AriaMenu>
    )
}
