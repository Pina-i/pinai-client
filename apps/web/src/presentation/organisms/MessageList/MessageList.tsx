import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react"
import {
    ListBox,
    ListBoxItem,
    ListLayout,
    Virtualizer,
} from "react-aria-components"
import { DateDivider } from "@/presentation/molecules/DateDivider/DateDivider"
import { GroupEventLine } from "@/presentation/molecules/GroupEventLine/GroupEventLine"
import { MessageThreadContext, ReactionPickerContext, type LinkedMessage } from "./MessageList.context"
import { formatDateDividerLabel } from "@/presentation/molecules/DateDivider/DateDivider.helper"
import { EmojiPickerPopover } from "@/presentation/molecules/EmojiPickerPopover/EmojiPickerPopover"
import type { Message, TimelineNotice } from "@/lib/types"
import { interleaveTimeline, resentCopies } from "@pinai/domain/models/dm"
import { cn } from "@/presentation/_libs/utils"
import { MessageItem } from "../MessageItem/MessageItem"
import { useStickToBottom } from "./MessageList.scroll"

/** Imperative scroll surface — page calls `scrollToBottom()` after a local send. */
export interface MessageListHandle {
    scrollToBottom: () => void
}

interface MessageListProps {
    messages: Message[]
    /** Lines between the messages, in the timeline's order. */
    notices: TimelineNotice[]
    conversationKey: string
    recipientAddress: string
    isGroup: boolean
    onReply: (messageId: string) => void
    onRetry: (messageId: string) => void
    canResend: (message: Message) => boolean
    handleRef?: RefObject<MessageListHandle | null>
}

/** Gap above which we restart a sequence even when the author is the same. */
const SEQUENCE_GAP_MS = 5 * 60 * 1000

/**
 * Average row height for the virtualizer's scrollbar math before rows are
 * measured: a header row is ~62px (8px padding each side + name + one line),
 * a continuation ~38px. Rows carry their own padding, so the list adds none.
 */
const ESTIMATED_ROW_SIZE = 56
const LIST_PADDING = 2
/** How long a row jumped to stays highlighted. */
const FLASH_MS = 1700
const LIST_GAP = 0

type RowItem =
    | { kind: "divider"; id: string; label: string }
    | { kind: "notice"; id: string; notice: TimelineNotice }
    | {
          kind: "message"
          id: string
          message: Message
          first: boolean
      }

type DividerRow = Extract<RowItem, { kind: "divider" }>
type MessageRow = Extract<RowItem, { kind: "message" }>
type NoticeRow = Extract<RowItem, { kind: "notice" }>

// React Aria caches each rendered row by the identity of its item object, so
// rows are reused per message: appending one message then re-renders one row,
// not the whole list. Messages are replaced, never mutated, so a WeakMap on the
// message is exact.
const messageRows = new WeakMap<Message, [rest: MessageRow, first: MessageRow]>()
const dividerRows = new WeakMap<Message | TimelineNotice, DividerRow>()
const noticeRows = new WeakMap<TimelineNotice, NoticeRow>()

function messageRow(message: Message, first: boolean): MessageRow {
    let rows = messageRows.get(message)
    if (!rows) {
        rows = [
            { kind: "message", id: message.id, message, first: false },
            { kind: "message", id: message.id, message, first: true },
        ]
        messageRows.set(message, rows)
    }
    return rows[first ? 1 : 0]
}

function noticeRow(notice: TimelineNotice): NoticeRow {
    let row = noticeRows.get(notice)
    if (!row) {
        row = { kind: "notice", id: notice.id, notice }
        noticeRows.set(notice, row)
    }
    return row
}

// Keyed by the entry the divider precedes; the label check covers "Today"
// turning into "Yesterday" at midnight.
function dividerRow(entry: Message | TimelineNotice, dayKey: string, label: string): DividerRow {
    const cached = dividerRows.get(entry)
    if (cached?.label === label) return cached
    const row: DividerRow = { kind: "divider", id: `divider-${dayKey}-${entry.id}`, label }
    dividerRows.set(entry, row)
    return row
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
// Memoised: the page also re-renders when the conversation object refreshes, which leaves every prop here unchanged.
export const MessageList = memo(function MessageList({
    messages,
    notices,
    conversationKey,
    recipientAddress,
    isGroup,
    onReply,
    onRetry,
    canResend,
    handleRef,
}: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null)

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

        for (const item of interleaveTimeline(messages, notices)) {
            const date = new Date(item.entry.createdAt)
            const dayKey = date.toDateString()
            if (dayKey !== lastDayKey) {
                // Date dividers carry the id of the row they precede so
                // the React key stays stable when older history loads in
                // above an existing divider.
                acc.push(dividerRow(item.entry, dayKey, formatDateDividerLabel(date)))
                lastDayKey = dayKey
                prevAuthorAddress = undefined
                prevCreatedAt = undefined
            }
            if (item.kind === "event") {
                acc.push(noticeRow(item.entry))
                prevAuthorAddress = undefined
                prevCreatedAt = undefined
                continue
            }
            const msg = item.entry
            const sameAuthor = prevAuthorAddress != null && prevAuthorAddress === msg.authorAddress
            const within = prevCreatedAt != null && date.getTime() - prevCreatedAt <= SEQUENCE_GAP_MS
            const first = !sameAuthor || !within
            acc.push(messageRow(msg, first))
            prevAuthorAddress = msg.authorAddress
            prevCreatedAt = date.getTime()
        }
        return acc
    }, [messages, notices])

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

    useStickToBottom(scrollRef, conversationKey, items.length)

    // ─── Links between rows ───────────────────────────────────────────────────

    const threadLinks = useMemo(() => {
        const links = new Map<string, LinkedMessage>()
        for (const [from, copy] of resentCopies(messages)) links.set(from, { id: copy.id, timestamp: copy.timestamp })
        return links
    }, [messages])

    const itemsRef = useRef(items)
    useEffect(() => {
        itemsRef.current = items
    })
    const [flashedMessageId, setFlashedMessageId] = useState<string | null>(null)
    const flashTimerRef = useRef<number | undefined>(undefined)

    // Rows off-screen aren't in the DOM, so a jump first scrolls to the row's
    // estimated offset and looks again once the virtualizer has rendered it.
    const jumpToMessage = useCallback((messageId: string) => {
        const box = scrollRef.current
        if (!box) return
        const reveal = (attemptsLeft: number) => {
            const row = box.querySelector<HTMLElement>(`[data-key="${CSS.escape(messageId)}"]`)
            if (row) {
                const top = box.scrollTop + row.getBoundingClientRect().top - box.getBoundingClientRect().top
                box.scrollTo({ top: top - box.clientHeight / 2 + row.offsetHeight / 2, behavior: "smooth" })
                setFlashedMessageId(null)
                requestAnimationFrame(() => setFlashedMessageId(messageId))
                window.clearTimeout(flashTimerRef.current)
                flashTimerRef.current = window.setTimeout(() => setFlashedMessageId(null), FLASH_MS)
                return
            }
            const index = itemsRef.current.findIndex((item) => item.id === messageId)
            if (index === -1 || attemptsLeft === 0) return
            box.scrollTop = index * ESTIMATED_ROW_SIZE - box.clientHeight / 2
            requestAnimationFrame(() => reveal(attemptsLeft - 1))
        }
        reveal(3)
    }, [])

    useEffect(() => () => window.clearTimeout(flashTimerRef.current), [])

    const threadContextValue = useMemo(
        () => ({ resentCopies: threadLinks, flashedMessageId, jumpToMessage }),
        [threadLinks, flashedMessageId, jumpToMessage],
    )

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
            <MessageThreadContext.Provider value={threadContextValue}>
                {/* A row grows after it is first measured — an image or GIF that loads — and the
                    virtualizer clips each row to its measured height until it measures again. */}
                <Virtualizer
                    shouldObserveItemSize
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
                        // Everything the row renderer closes over: a change re-renders the rows, nothing else does.
                        dependencies={[conversationKey, recipientAddress, isGroup, onReply, onRetry, canResend, openReactionPicker]}
                        className="min-h-0 flex-1 overflow-auto outline-none"
                        style={{ display: "block" }}
                    >
                        {(item) => (
                            <ListBoxItem
                                id={item.id}
                                textValue={
                                    item.kind === "message"
                                        ? item.message.content
                                        : item.kind === "notice"
                                          ? item.notice.text
                                          : item.label
                                }
                                className={cn("px-1.5 outline-none", item.kind === "message" && item.first && "pt-2")}
                            >
                                {item.kind === "divider" ? (
                                    <DateDivider label={item.label} />
                                ) : item.kind === "notice" ? (
                                    <GroupEventLine text={item.notice.text} timestamp={item.notice.timestamp} />
                                ) : (
                                    <MessageItem
                                        message={item.message}
                                        conversationKey={conversationKey}
                                        recipientAddress={recipientAddress}
                                        isGroup={isGroup}
                                        first={item.first}
                                        onReply={onReply}
                                        onRetry={onRetry}
                                        canResend={canResend}
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
            </MessageThreadContext.Provider>
        </ReactionPickerContext.Provider>
    )
})
