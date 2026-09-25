import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"

// Within this distance of the end, the reader counts as being at the bottom.
const PINNED_SLACK_PX = 48
// A scroll this soon after wheel, touch, pointer or key input is the reader's.
const USER_INTENT_MS = 1000
const INTENT_EVENTS = ["wheel", "touchmove", "pointerdown", "keydown"] as const

/**
 * Chat scrolling: a conversation opens at its end and stays pinned there while
 * rows arrive, get measured or grow, and while the viewport resizes — until
 * the reader scrolls up. Corrections come from a ResizeObserver, whose
 * callbacks run after layout and before paint, so no frame shows a snap.
 */
export function useStickToBottom(
    scrollRef: RefObject<HTMLElement | null>,
    conversationKey: string,
    itemCount: number,
) {
    const pinnedRef = useRef(true)
    const openedKeyRef = useRef<string | null>(null)

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        // Only the reader can unpin. The virtualizer re-measures rows inside
        // scroll handling, so a layout-driven scroll event can show a large gap
        // for a moment that nobody scrolled — without intent, it must not count.
        let intentAt = -Infinity
        const markIntent = () => {
            intentAt = performance.now()
        }
        const onScroll = () => {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= PINNED_SLACK_PX
            if (atBottom) pinnedRef.current = true
            else if (performance.now() - intentAt < USER_INTENT_MS) pinnedRef.current = false
        }
        const repin = () => {
            if (pinnedRef.current) el.scrollTop = el.scrollHeight
        }
        // The container covers viewport changes (composer tray, window); its
        // content element — the virtualizer's sizer — covers every row change.
        const observer = new ResizeObserver(repin)
        observer.observe(el)
        if (el.firstElementChild) observer.observe(el.firstElementChild)
        el.addEventListener("scroll", onScroll, { passive: true })
        for (const type of INTENT_EVENTS) el.addEventListener(type, markIntent, { passive: true })
        return () => {
            observer.disconnect()
            el.removeEventListener("scroll", onScroll)
            for (const type of INTENT_EVENTS) el.removeEventListener(type, markIntent)
        }
    }, [scrollRef])

    const hasItems = itemCount > 0
    useLayoutEffect(() => {
        if (!hasItems || openedKeyRef.current === conversationKey) return
        openedKeyRef.current = conversationKey
        pinnedRef.current = true
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [scrollRef, conversationKey, hasItems])
}
