import { useCallback, useDeferredValue, useEffect, useState } from "react"
import { useHoldSplashScreen } from "@/presentation/hooks/use-hold-splash-screen"
import type { Message, TimelineNotice } from "@/lib/types"

// Under this, the list simply fades in; a skeleton for less would only flash.
const SKELETON_DELAY_MS = 120
// The list's fade in, `ConversationTimeline`'s `duration-150`.
const FADE_MS = 150

// Stable, so `useDeferredValue`'s initial value isn't a new array each render.
const NO_MESSAGES: Message[] = []
const NO_NOTICES: TimelineNotice[] = []

/**
 * One conversation's timeline, mounted afresh for each: its list renders in the background
 * (the route commits at once), and shows only once laid out and pinned to the end, so
 * neither the previous conversation nor the rows settling are ever seen.
 */
export function useConversationTimelineViewModel(messages: Message[], notices: TimelineNotice[], isLoading: boolean) {
    const deferredMessages = useDeferredValue(messages, NO_MESSAGES)
    const deferredNotices = useDeferredValue(notices, NO_NOTICES)
    const isRendering = deferredMessages !== messages || deferredNotices !== notices
    // After a hard refresh the page is not loaded until that background render lands.
    useHoldSplashScreen(deferredMessages !== messages, { reshow: "never" })

    const [isSettled, setIsSettled] = useState(false)
    const settle = useCallback(() => setIsSettled(true), [])
    const isEmpty = deferredMessages.length === 0 && deferredNotices.length === 0
    // Nothing to lay out: an empty conversation shows once its history answered.
    const isRevealed = isSettled || (isEmpty && !isRendering && !isLoading)

    const [skeleton, setSkeleton] = useState<"waiting" | "shown" | "gone">("waiting")
    useEffect(() => {
        if (!isRevealed) {
            const timer = window.setTimeout(() => setSkeleton((s) => (s === "waiting" ? "shown" : s)), SKELETON_DELAY_MS)
            return () => window.clearTimeout(timer)
        }
        // Kept while it fades out over the list fading in.
        if (skeleton !== "shown") return
        const timer = window.setTimeout(() => setSkeleton("gone"), FADE_MS)
        return () => window.clearTimeout(timer)
    }, [isRevealed, skeleton])

    return {
        messages: deferredMessages,
        notices: deferredNotices,
        isRevealed,
        settle,
        showSkeleton: skeleton === "shown",
    }
}
