/**
 * The window is attended while visible and focused. Coming back to it with a conversation open
 * marks what arrived meanwhile read, on the IdP and here, once per return.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DmConversationSummary } from "@pinai/domain/models/dm"

const mocks = vi.hoisted(() => ({ order: [] as string[], markConversationRead: vi.fn() }))
vi.mock("@/ioc", () => ({ getDmPort: () => ({ markConversationRead: mocks.markConversationRead }) }))
vi.mock("@/store/store", async () => {
    const { create } = await import("zustand")
    return {
        useAppStore: create<{ dmUnread: Record<string, number> } & Record<string, unknown>>()((set) => ({
            idpUrl: "https://idp.test",
            accessToken: "access-1",
            activeDm: null,
            dmUnread: {},
            clearDmUnread: (id: string) =>
                set((s) => {
                    const next = { ...s.dmUnread }
                    delete next[id]
                    return { dmUnread: next }
                }),
        })),
    }
})

const { useBeingRead, useWindowAttended } = await import("@/presentation/hooks/use-window-attention")
const { useReadOnReturn } = await import("@/presentation/hooks/use-read-on-return")
const { dmConversationsQueryKey } = await import("@/presentation/hooks/useLoadDmConversations")
const { useAppStore } = await import("@/store/store")

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let visible = true
let focused = true
let root: Root | null = null
let client: QueryClient

beforeEach(() => {
    visible = true
    focused = true
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => (visible ? "visible" : "hidden"))
    vi.spyOn(document, "hasFocus").mockImplementation(() => focused)
    mocks.order = []
    mocks.markConversationRead.mockReset()
    mocks.markConversationRead.mockImplementation(async () => void mocks.order.push("marked"))
    client = new QueryClient()
    vi.spyOn(client, "invalidateQueries").mockImplementation(async () => void mocks.order.push("refreshed"))
    useAppStore.setState({ idpUrl: "https://idp.test", accessToken: "access-1", activeDm: null, dmUnread: {} })
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    vi.restoreAllMocks()
})

async function render(element: ReturnType<typeof createElement>) {
    await act(async () => {
        root ??= createRoot(document.createElement("div"))
        root.render(createElement(QueryClientProvider, { client }, element))
    })
}

async function hide() {
    visible = false
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")))
}

async function show() {
    visible = true
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")))
}

async function blur() {
    focused = false
    await act(async () => void window.dispatchEvent(new Event("blur")))
}

async function focus() {
    focused = true
    await act(async () => void window.dispatchEvent(new Event("focus")))
}

function listed(conversationId: string, unread: number) {
    client.setQueryData(dmConversationsQueryKey("https://idp.test"), [
        { conversation_id: conversationId, unread_count: unread } as DmConversationSummary,
    ])
}

describe("useWindowAttended", () => {
    it("follows the window's visibility and focus", async () => {
        const seen: boolean[] = []
        function Probe() {
            seen.push(useWindowAttended())
            return null
        }
        await render(createElement(Probe))

        await hide()
        await show()
        await blur()
        await focus()

        expect(seen).toEqual([true, false, true, false, true])
    })

    it("looks again once a blur has settled, where the browser still reported focus inside it", async () => {
        const seen: boolean[] = []
        function Probe() {
            seen.push(useWindowAttended())
            return null
        }
        await render(createElement(Probe))

        await act(async () => {
            window.dispatchEvent(new Event("blur"))
            focused = false
            await new Promise((settled) => setTimeout(settled, 0))
        })

        expect(seen).toEqual([true, false])
    })
})

describe("useBeingRead", () => {
    it("is the open conversation on an attended window, and re-renders only the row it changes for", async () => {
        const renders: Record<string, boolean[]> = { "dm-alice": [], "group-surf": [] }
        function Row({ id }: { id: string }) {
            renders[id].push(useBeingRead(id))
            return null
        }
        useAppStore.setState({ activeDm: "dm-alice" })
        await render(
            createElement("div", null, createElement(Row, { id: "dm-alice" }), createElement(Row, { id: "group-surf" })),
        )

        await blur()
        await focus()

        expect(renders["dm-alice"]).toEqual([true, false, true])
        expect(renders["group-surf"]).toEqual([false])
    })
})

describe("useReadOnReturn", () => {
    function Page({ conversationId }: { conversationId: string | null }) {
        useReadOnReturn(conversationId)
        return null
    }

    it("marks what arrived while away read on the IdP, clears it here, then refreshes the list", async () => {
        await render(createElement(Page, { conversationId: "dm-alice" }))
        await blur()
        useAppStore.setState({ dmUnread: { "dm-alice": 2, "group-surf": 1 } })

        await focus()

        expect(mocks.markConversationRead).toHaveBeenCalledWith("https://idp.test", "access-1", "dm-alice")
        expect(useAppStore.getState().dmUnread).toEqual({ "group-surf": 1 })
        expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: dmConversationsQueryKey("https://idp.test") })
        expect(mocks.order).toEqual(["marked", "refreshed"])
    })

    it("marks it when only the IdP's list counts it", async () => {
        listed("dm-alice", 3)
        await render(createElement(Page, { conversationId: "dm-alice" }))
        await hide()

        await show()

        expect(mocks.markConversationRead).toHaveBeenCalledOnce()
    })

    it("does nothing when there is nothing to mark", async () => {
        listed("dm-alice", 0)
        await render(createElement(Page, { conversationId: "dm-alice" }))
        await blur()

        await focus()

        expect(mocks.markConversationRead).not.toHaveBeenCalled()
        expect(client.invalidateQueries).not.toHaveBeenCalled()
    })

    it("runs once per return: a restored window sends both visibility and focus", async () => {
        await render(createElement(Page, { conversationId: "dm-alice" }))
        visible = false
        focused = false
        await act(async () => void document.dispatchEvent(new Event("visibilitychange")))
        useAppStore.setState({ dmUnread: { "dm-alice": 1 } })

        await show()
        expect(mocks.markConversationRead).not.toHaveBeenCalled()
        await focus()
        await focus()

        expect(mocks.markConversationRead).toHaveBeenCalledOnce()
    })

    it("marks again at a new return while the last mark is still on its way", async () => {
        let land = () => {}
        mocks.markConversationRead.mockImplementationOnce(() => new Promise<void>((resolve) => (land = resolve)))
        await render(createElement(Page, { conversationId: "dm-alice" }))
        await blur()
        useAppStore.setState({ dmUnread: { "dm-alice": 1 } })
        await focus()

        await blur()
        useAppStore.setState({ dmUnread: { "dm-alice": 1 } })
        await focus()
        await act(async () => land())

        expect(mocks.markConversationRead).toHaveBeenCalledTimes(2)
        expect(useAppStore.getState().dmUnread).toEqual({})
    })

    it("does nothing at mount or while it stays attended: opening a conversation reads it", async () => {
        useAppStore.setState({ dmUnread: { "dm-alice": 2 } })
        await render(createElement(Page, { conversationId: "dm-alice" }))

        await focus()

        expect(mocks.markConversationRead).not.toHaveBeenCalled()
    })

    it("marks the conversation open at the return, after a switch while away", async () => {
        await render(createElement(Page, { conversationId: "dm-alice" }))
        await blur()
        await render(createElement(Page, { conversationId: "group-surf" }))
        useAppStore.setState({ dmUnread: { "dm-alice": 1, "group-surf": 2 } })

        await focus()

        expect(mocks.markConversationRead).toHaveBeenCalledOnce()
        expect(mocks.markConversationRead).toHaveBeenCalledWith("https://idp.test", "access-1", "group-surf")
        expect(useAppStore.getState().dmUnread).toEqual({ "dm-alice": 1 })
    })

    it("does nothing once signed out, nor without a conversation open", async () => {
        useAppStore.setState({ dmUnread: { "dm-alice": 2 } })
        await render(createElement(Page, { conversationId: null }))
        await blur()
        await focus()

        await render(createElement(Page, { conversationId: "dm-alice" }))
        useAppStore.setState({ accessToken: null })
        await blur()
        await focus()

        expect(mocks.markConversationRead).not.toHaveBeenCalled()
    })
})
