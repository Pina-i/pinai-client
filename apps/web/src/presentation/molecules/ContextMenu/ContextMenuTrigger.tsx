import { MenuTrigger, Popover as AriaPopover, type Placement } from "react-aria-components"
import { motion } from "motion/react"
import { cn } from "@/presentation/_libs/utils"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"
import type { ReactNode } from "react"
import { ContextMenuList, type ContextMenuItem } from "./ContextMenuList"

interface ContextMenuTriggerProps {
    /** A React-Aria-pressable element (e.g. our IconButton) that opens the menu. */
    trigger: ReactNode
    items: ContextMenuItem[]
    /** Accessible label for the menu. */
    label: string
    placement?: Placement
    offset?: number
    width?: number
}

/** Click-triggered sibling of {@link import("./ContextMenu").ContextMenu}: the
 *  same popover surface (motion panel + `ContextMenuList`), opened by pressing
 *  `trigger` instead of right-click — so a `⋯` button menu looks identical to
 *  the right-click context menu. */
export function ContextMenuTrigger({
    trigger,
    items,
    label,
    placement = "bottom end",
    offset = 6,
    width,
}: ContextMenuTriggerProps) {
    return (
        <MenuTrigger>
            {trigger}
            <AriaPopover placement={placement} offset={offset} className="outline-none">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("overflow-hidden", popoverSurface)}
                >
                    <ContextMenuList items={items} label={label} width={width} />
                </motion.div>
            </AriaPopover>
        </MenuTrigger>
    )
}
