import {
    MenuTrigger,
    Menu as AriaMenu,
    MenuItem as AriaMenuItem,
    Popover,
    type Placement,
} from "react-aria-components"
import type { ReactNode } from "react"
import { cn } from "@/presentation/_libs/utils"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"

export interface MenuItemDescriptor {
    key: string
    label: ReactNode
    icon?: ReactNode
    onAction?: () => void
    isDisabled?: boolean
    /** Only meaningful for vertical orientation. */
    variant?: "default" | "destructive"
}

interface MenuProps {
    /** The trigger element. Must be a React Aria Button (or a component using AriaButton internally). */
    trigger: ReactNode
    items: MenuItemDescriptor[]
    placement?: Placement
    /** Gap in pixels between trigger and popover along the main axis. Defaults to RA's 8. Set to 0 for flush. */
    offset?: number
    /** "vertical" (default) renders a list of full-width items; "horizontal" renders a row of tile items (e.g. emoji pickers). */
    orientation?: "vertical" | "horizontal"
    /** Extra classes for the popover element (use for width, max-width, margins…). */
    popoverClassName?: string
    /** Extra classes for the inner Menu element. */
    menuClassName?: string
    /** Extra classes applied to every MenuItem (extends defaults). */
    itemClassName?: string
}

export function Menu({
    trigger,
    items,
    placement = "bottom start",
    offset,
    orientation = "vertical",
    popoverClassName,
    menuClassName,
    itemClassName,
}: MenuProps) {
    const isHorizontal = orientation === "horizontal"

    return (
        <MenuTrigger>
            {trigger}
            <Popover
                placement={placement}
                offset={offset}
                className={cn(
                    popoverSurface,
                    "p-1.5 outline-none",
                    "entering:animate-in entering:fade-in-0 entering:zoom-in-95 entering:duration-150",
                    popoverClassName,
                )}
            >
                <AriaMenu
                    className={cn(
                        "outline-none",
                        isHorizontal && "flex items-center gap-1",
                        menuClassName,
                    )}
                >
                    {items.map((item) => (
                        <AriaMenuItem
                            key={item.key}
                            id={item.key}
                            isDisabled={item.isDisabled}
                            onAction={item.onAction}
                            className={cn(
                                "cursor-pointer outline-none transition-colors",
                                isHorizontal
                                    ? "rounded-[8px] p-1 text-base hover:bg-surf2 focus:bg-surf2"
                                    : cn(
                                          "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px]",
                                          item.variant === "destructive"
                                              ? "text-dnd hover:bg-[color-mix(in_oklab,var(--dnd)_12%,transparent)] focus:bg-[color-mix(in_oklab,var(--dnd)_12%,transparent)]"
                                              : "text-muted-foreground hover:bg-surf2 hover:text-foreground focus:bg-surf2 focus:text-foreground",
                                      ),
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                itemClassName,
                            )}
                        >
                            {item.icon}
                            {item.label}
                        </AriaMenuItem>
                    ))}
                </AriaMenu>
            </Popover>
        </MenuTrigger>
    )
}
