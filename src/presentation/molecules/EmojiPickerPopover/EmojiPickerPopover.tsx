import type { ReactNode, RefObject } from "react"
import {
    Dialog,
    DialogTrigger,
    Popover as AriaPopover,
    type PopoverProps as AriaPopoverProps,
} from "react-aria-components"
import { EmojiPicker } from "@/presentation/molecules/EmojiPicker/EmojiPicker"

interface BaseProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onEmojiSelect: (emoji: string) => void
    placement?: AriaPopoverProps["placement"]
    /** Gap in px between trigger and popover. Defaults to RA's 8. */
    offset?: number
}

interface InternalTriggerProps extends BaseProps {
    /** A React-Aria-compatible pressable element. The popover anchors to it. */
    trigger: ReactNode
    triggerRef?: never
}

interface ExternalTriggerProps extends BaseProps {
    /** A ref to any DOM element the popover should anchor to. Used when the
     *  trigger and the popover live in different parts of the tree (e.g. an
     *  invisible anchor div whose position mirrors a button inside a
     *  virtualized list). */
    triggerRef: RefObject<Element | null>
    trigger?: never
}

export type EmojiPickerPopoverProps = InternalTriggerProps | ExternalTriggerProps

/**
 * Popover wrapper around `EmojiPicker`. Two modes:
 *
 *  - **Internal trigger** (`trigger` prop): renders via `DialogTrigger` —
 *    matches the standard react-aria-components pattern. Use when the
 *    pressable element opening the popover is a natural child.
 *  - **External anchor** (`triggerRef` prop): renders the popover
 *    standalone with `triggerRef` so it can anchor to any DOM element
 *    elsewhere in the tree. Used when the popover lives outside a
 *    virtualized list but should appear next to a button inside.
 */
export function EmojiPickerPopover(props: EmojiPickerPopoverProps) {
    const {
        isOpen,
        onOpenChange,
        onEmojiSelect,
        placement = "bottom end",
        offset = 6,
    } = props

    const content = (
        <Dialog aria-label="Emoji picker" className="outline-none">
            <div className="overflow-hidden rounded-lg border border-border-strong bg-popover shadow-xl">
                <EmojiPicker onEmojiSelect={onEmojiSelect} />
            </div>
        </Dialog>
    )

    if ("trigger" in props && props.trigger !== undefined) {
        return (
            <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
                {props.trigger}
                <AriaPopover
                    placement={placement}
                    offset={offset}
                    className="z-50 outline-none"
                >
                    {content}
                </AriaPopover>
            </DialogTrigger>
        )
    }

    // External-anchor mode: conditionally render so the EmojiPicker
    // doesn't mount until needed. `triggerRef` stays stable across
    // opens — the caller is responsible for repositioning the anchor.
    if (!isOpen) return null
    return (
        <AriaPopover
            triggerRef={props.triggerRef}
            isOpen
            onOpenChange={onOpenChange}
            placement={placement}
            offset={offset}
            className="z-50 outline-none"
        >
            {content}
        </AriaPopover>
    )
}
