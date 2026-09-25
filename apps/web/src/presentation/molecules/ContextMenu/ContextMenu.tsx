import { useRef, useState, type MouseEvent, type ReactNode } from "react"
import {
    Dialog,
    Popover as AriaPopover,
    type PopoverProps as AriaPopoverProps,
} from "react-aria-components"
import { motion } from "motion/react"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"
import { cn } from "@/presentation/_libs/utils"

interface ContextMenuProps {
    /** The element to right-click. A function receives whether the menu is open. */
    trigger: ReactNode | ((isOpen: boolean) => ReactNode)
    /** Revealed content. A function receives a `close` callback. */
    children: ReactNode | ((close: () => void) => ReactNode)
    /** Accessible label for the popover. */
    label?: string
    placement?: AriaPopoverProps["placement"]
    /** Gap in px between the click point and the panel. */
    offset?: number
    /** Extra classes for the panel container. */
    className?: string
}

/** Picks a transform-origin so the entrance scale grows out of the anchored corner. */
function transformOriginFor(placement: AriaPopoverProps["placement"]): string {
    const [main = "bottom", cross] = String(placement ?? "bottom").split(" ")
    const mainOrigin =
        main === "bottom" ? "top"
        : main === "top" ? "bottom"
        : main === "left" ? "right"
        : main === "right" ? "left"
        : "center"
    let crossOrigin = ""
    if (cross === "start" || cross === "left") crossOrigin = "left"
    else if (cross === "end" || cross === "right") crossOrigin = "right"
    else if (cross === "top") crossOrigin = "top"
    else if (cross === "bottom") crossOrigin = "bottom"
    return crossOrigin ? `${mainOrigin} ${crossOrigin}` : mainOrigin
}

/** Right-click `trigger` to reveal `children` in a popover at the cursor — via
 *  a stable hidden anchor div, the same trick as the message reaction picker. */
export function ContextMenu({
    trigger,
    children,
    label = "Context menu",
    placement = "bottom start",
    offset = 4,
    className,
}: ContextMenuProps) {
    const anchorRef = useRef<HTMLDivElement | null>(null)
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
    const isOpen = position !== null
    const close = () => setPosition(null)

    function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
        event.preventDefault()
        setPosition({ x: event.clientX, y: event.clientY })
    }

    return (
        <>
            <div className="contents" onContextMenu={handleContextMenu}>
                {typeof trigger === "function" ? trigger(isOpen) : trigger}
            </div>

            <div
                ref={anchorRef}
                aria-hidden
                className="pointer-events-none fixed"
                style={{ top: position?.y ?? -9999, left: position?.x ?? -9999, width: 0, height: 0 }}
            />

            {isOpen && (
                <AriaPopover
                    triggerRef={anchorRef}
                    isOpen
                    onOpenChange={(open) => {
                        if (!open) close()
                    }}
                    placement={placement}
                    offset={offset}
                    className="outline-none"
                >
                    <Dialog aria-label={label} className="outline-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            style={{ transformOrigin: transformOriginFor(placement) }}
                            className={cn("overflow-hidden", popoverSurface, className)}
                        >
                            {typeof children === "function" ? children(close) : children}
                        </motion.div>
                    </Dialog>
                </AriaPopover>
            )}
        </>
    )
}
