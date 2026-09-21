import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react"
import {
    ListBox,
    ListBoxItem,
    ListLayout,
    Virtualizer,
} from "react-aria-components"
import { DateDivider } from "@/presentation/molecules/DateDivider/DateDivider"
import { ReactionPickerContext } from "./MessageList.context"
import { formatDateDividerLabel } from "@/presentation/molecules/DateDivider/DateDivider.helper"
import { EmojiPickerPopover } from "@/presentation/molecules/EmojiPickerPopover/EmojiPickerPopover"
import type { Message } from "@/lib/types"
import { MessageItem } from "../MessageItem/MessageItem"

/** Imperative scroll surface — page calls `scrollToBottom()` after a local send. */
export interface MessageListHandle {
    scrollToBottom: () => void
}

interface MessageListProps {
    messages: Message[]
    conversationKey: string
    recipientAddress: string
    onReply: (messageId: string) => void
    onRetry: (messageId: string) => void
    hasPendingIntent: (messageId: string) => boolean
    handleRef?: RefObject<MessageListHandle | null>
}

/** Gap above which we restart a sequence even when the author is the same. */
const SEQUENCE_GAP_MS = 5 * 60 * 1000

/**
 * Average row height — virtualizer uses this for scrollbar math before
 * measuring actual rows. 60 px is roughly: 13.5 px line-height × 1.55 +
 * sequence gap. Short text rows sit near this; first-in-sequence or
 * attachment rows are taller, and the virtualizer re-measures once they
 * paint.
 */
const ESTIMATED_ROW_SIZE = 60
const LIST_PADDING = 28
const LIST_GAP = 2

type RowItem =
    | { kind: "divider"; id: string; label: string }
    | {
          kind: "message"
          id: string
          message: Message
          first: boolean
      }

interface ReactionPickerState {
    /** Stable id of the message that opened the picker. Threaded down so the
     *  owning `MessageItem` can keep its action bar visible (purely a UX
     *  cue — the popover itself anchors to a fixed-position div, not the
     *  smile button). */
    messageId: string
    /** Viewport-relative rect of the smile button at open time. Snapshot
     *  rather than tracked live: when the user scrolls or otherwise
     *  changes the message-list layout, we close the picker. */
    anchorRect: DOMRect
    onReact: (emoji: string) => void
}

/**
 * Read by `MessageItem` to know whether the lifted reaction picker is
 * anchored to it. Context rather than props because react-aria's
 * `<ListBox items={…}>{(item) => …}` caches the rendered output keyed
 * by item reference — closure-captured state in the render function
 * doesn't refresh when the parent re-renders, so a regular prop
 * threaded through never updates. Context triggers every consumer to
 * re-render, sidestepping the cache.
 */
export function MessageList({
    messages,
    conversationKey,
    recipientAddress,
    onReply,
    onRetry,
    hasPendingIntent,
    handleRef,
}: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const initialScrolledForKeyRef = useRef<string | null>(null)

    // Reaction picker hoisted to this level so the inner Virtualizer +
    // ListBox of the EmojiPicker isn't nested inside the outer one (the
    // virtualized message list). Nested react-aria-components collections
    // share too much context — keeping them as siblings cleanly isolates
    // them.
    //
    // The popover anchors to a single hidden div whose viewport position
    // we set via inline CSS to mirror the clicked smile button's rect.
    // react-aria's `Popover` reads its `triggerRef.current` once and then
    // observes that element — keeping the ref stable (and just moving
    // the element) sidesteps the "mutating .current doesn't notify the
    // observer" problem.
    const reactionAnchorRef = useRef<HTMLDivElement | null>(null)
    // Tagged with the conversation it was opened in, so switching
    // conversations closes it by derivation rather than by an effect that
    // fires a second render to clear state.
    const [openPicker, setOpenPicker] = useState<
        (ReactionPickerState & { conversationKey: string }) | null
    >(null)
    const reactionPicker = openPicker?.conversationKey === conversationKey ? openPicker : null

    const openReactionPicker = useCallback(
        (messageId: string, triggerEl: HTMLButtonElement, onReact: (emoji: string) => void) => {
            setOpenPicker({
                conversationKey,
                messageId,
                anchorRect: triggerEl.getBoundingClientRect(),
                onReact,
            })
        },
        [conversationKey],
    )

    const closeReactionPicker = useCallback(() => {
        setOpenPicker(null)
    }, [])

    const items = useMemo<RowItem[]>(() => {
        const acc: RowItem[] = []
        let lastDayKey: string | undefined
        let prevAuthorAddress: string | undefined
        let prevCreatedAt: number | undefined

        for (const msg of messages) {
            const date = new Date(msg.createdAt)
            const dayKey = date.toDateString()
            if (dayKey !== lastDayKey) {
                // Date dividers carry the message id of the row they
                // precede so the React key stays stable when older
                // history loads in above an existing divider.
                acc.push({ kind: "divider", id: `divider-${dayKey}-${msg.id}`, label: formatDateDividerLabel(date) })
                lastDayKey = dayKey
                prevAuthorAddress = undefined
                prevCreatedAt = undefined
            }
            const sameAuthor = prevAuthorAddress != null && prevAuthorAddress === msg.authorAddress
            const within = prevCreatedAt != null && date.getTime() - prevCreatedAt <= SEQUENCE_GAP_MS
            const first = !sameAuthor || !within
            acc.push({ kind: "message", id: msg.id, message: msg, first })
            prevAuthorAddress = msg.authorAddress
            prevCreatedAt = date.getTime()
        }
        return acc
    }, [messages])

    useImperativeHandle(
        handleRef,
        () => ({
            scrollToBottom: () => {
                const el = scrollRef.current
                if (!el) return
                el.scrollTop = el.scrollHeight
            },
        }),
        [],
    )

    // On first paint of a new conversation (or first non-empty render),
    // anchor the scroll at the bottom — Virtualizer/ListLayout position
    // items from the top by default, but chat is bottom-anchored. We
    // poll a few rAFs because variable-height measurement settles over
    // 1–2 frames.
    useEffect(() => {
        if (items.length === 0) return
        if (initialScrolledForKeyRef.current === conversationKey) return
        initialScrolledForKeyRef.current = conversationKey
        let cancelled = false
        let frames = 0
        const stick = () => {
            if (cancelled) return
            const el = scrollRef.current
            if (!el) return
            el.scrollTop = el.scrollHeight
            frames += 1
            if (frames < 3) requestAnimationFrame(stick)
        }
        requestAnimationFrame(stick)
        return () => {
            cancelled = true
        }
    }, [conversationKey, items.length])

    // Close the reaction picker when the user scrolls — the trigger
    // button can be virtualized-away mid-open and a stale ref would
    // anchor the popover to a detached element. Same when conversation
    // changes.
    useEffect(() => {
        if (!reactionPicker) return
        const sc = scrollRef.current
        if (!sc) return
        const onScroll = () => closeReactionPicker()
        sc.addEventListener("scroll", onScroll, { passive: true })
        return () => sc.removeEventListener("scroll", onScroll)
    }, [reactionPicker, closeReactionPicker])

    const pickerContextValue = useMemo(
        () => ({ openMessageId: reactionPicker?.messageId ?? null }),
        [reactionPicker?.messageId],
    )

    return (
        <ReactionPickerContext.Provider value={pickerContextValue}>
            <Virtualizer
                layout={ListLayout}
                layoutOptions={{
                    estimatedRowSize: ESTIMATED_ROW_SIZE,
                    gap: LIST_GAP,
                    padding: LIST_PADDING,
                }}
            >
                <ListBox
                    ref={scrollRef}
                    aria-label="Messages"
                    selectionMode="none"
                    items={items}
                    className="flex-1 overflow-auto outline-none"
                    style={{ display: "block" }}
                >
                    {(item) => (
                        <ListBoxItem
                            id={item.id}
                            textValue={item.kind === "message" ? item.message.content : item.label}
                            className="outline-none"
                        >
                            {item.kind === "divider" ? (
                                <DateDivider label={item.label} />
                            ) : (
                                <MessageItem
                                    message={item.message}
                                    conversationKey={conversationKey}
                                    recipientAddress={recipientAddress}
                                    first={item.first}
                                    onReply={onReply}
                                    onRetry={onRetry}
                                    hasPendingIntent={hasPendingIntent}
                                    onOpenReactionPicker={openReactionPicker}
                                />
                            )}
                        </ListBoxItem>
                    )}
                </ListBox>
            </Virtualizer>

            {/* Stable anchor — always in the DOM with a React-attached
                ref so the Popover's bounding-rect observer can settle
                on it. Repositioned via inline CSS to mirror whichever
                smile button opened the picker. `pointer-events-none`
                keeps it from intercepting interaction. */}
            <div
                ref={reactionAnchorRef}
                aria-hidden
                className="pointer-events-none fixed"
                style={{
                    top: reactionPicker?.anchorRect.top ?? -9999,
                    left: reactionPicker?.anchorRect.left ?? -9999,
                    width: reactionPicker?.anchorRect.width ?? 0,
                    height: reactionPicker?.anchorRect.height ?? 0,
                }}
            />

            <EmojiPickerPopover
                triggerRef={reactionAnchorRef}
                isOpen={reactionPicker !== null}
                onOpenChange={(open) => {
                    if (!open) closeReactionPicker()
                }}
                placement="bottom end"
                offset={6}
                onEmojiSelect={(emoji) => {
                    reactionPicker?.onReact(emoji)
                    closeReactionPicker()
                }}
            />
        </ReactionPickerContext.Provider>
    )
}
