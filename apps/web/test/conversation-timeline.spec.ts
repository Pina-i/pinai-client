/** Opening a conversation: its list shows once laid out, a skeleton only when that takes a while. */
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Message, TimelineNotice } from "@/lib/types"

vi.mock("@/presentation/hooks/use-hold-splash-screen", () => ({ useHoldSplashScreen: () => {} }))

const { useConversationTimelineViewModel } = await import(
    "@/presentation/pages/conversation/ConversationTimeline/ConversationTimeline.viewmodel"
)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MESSAGES = [{ id: "m1", content: "hi", createdAt: "2026-11-16T10:00:00Z" } as Message]
const NOTICES: TimelineNotice[] = []

const seen = {} as { vm: ReturnType<typeof useConversationTimelineViewModel> }
function Probe({ messages, isLoading }: { messages: Message[]; isLoading: boolean }) {
    const rendered = useConversationTimelineViewModel(messages, NOTICES, isLoading)
    useEffect(() => {
        seen.vm = rendered
    })
    return null
}

let root: Root
function render(messages: Message[], isLoading: boolean) {
    act(() => root.render(createElement(Probe, { messages, isLoading })))
}
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
    vi.useFakeTimers()
    root = createRoot(document.createElement("div"))
})

afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
})

describe("a conversation's timeline", () => {
    it("shows its list once laid out, with no skeleton when that is quick", () => {
        render(MESSAGES, false)
        expect(seen.vm.messages).toBe(MESSAGES)
        expect(seen.vm.isRevealed).toBe(false)
        wait(60)
        act(() => seen.vm.settle())
        expect(seen.vm.isRevealed).toBe(true)
        wait(500)
        expect(seen.vm.showSkeleton).toBe(false)
    })

    it("shows a skeleton past 120 ms, then fades it out over the list", () => {
        render(MESSAGES, false)
        wait(119)
        expect(seen.vm.showSkeleton).toBe(false)
        wait(1)
        expect(seen.vm.showSkeleton).toBe(true)
        act(() => seen.vm.settle())
        expect(seen.vm.isRevealed).toBe(true)
        expect(seen.vm.showSkeleton).toBe(true)
        wait(150)
        expect(seen.vm.showSkeleton).toBe(false)
    })

    it("shows an empty conversation once its history answered, its skeleton until then", () => {
        render([], true)
        expect(seen.vm.isRevealed).toBe(false)
        wait(120)
        expect(seen.vm.showSkeleton).toBe(true)
        render([], false)
        expect(seen.vm.isRevealed).toBe(true)
    })

    it("waits for the rows its history brings to an empty conversation", () => {
        render([], true)
        render(MESSAGES, false)
        expect(seen.vm.isRevealed).toBe(false)
        act(() => seen.vm.settle())
        expect(seen.vm.isRevealed).toBe(true)
    })
})
