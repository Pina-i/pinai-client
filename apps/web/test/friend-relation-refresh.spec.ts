/** The bell's answers to a friend request read "Add a friend"'s people again, by name and by address. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WsNotification } from "@pinai/domain/models/ws"

const mocks = vi.hoisted(() => ({
    acceptFriendRequest: vi.fn(async () => {}),
    rejectFriendRequest: vi.fn(async () => {}),
}))
vi.mock("@/ioc/index", () => ({
    getSocialPort: () => ({
        acceptFriendRequest: mocks.acceptFriendRequest,
        rejectFriendRequest: mocks.rejectFriendRequest,
    }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/store/store", async () => {
    const { create } = await import("zustand")
    return {
        useAppStore: create<{ notifications: WsNotification[] } & Record<string, unknown>>()((set) => ({
            notifications: [],
            accessToken: "access-1",
            idpUrl: "https://idp.test",
            dismissNotification: (id: string) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
            clearNotifications: () => set({ notifications: [] }),
        })),
    }
})

const { useAppStore } = await import("@/store/store")
const { BellProvider } = await import("@/presentation/providers/BellProvider/BellProvider")
const { NotificationsPopover } = await import("@/presentation/organisms/AppHeader/NotificationsPopover/NotificationsPopover")
const { peopleQueryKey } = await import("@/presentation/pages/home/FriendsPanel/AddFriendPopover/people-query-keys")

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let client: QueryClient

beforeEach(() => {
    // jsdom has no `CSS.escape`, which React Aria's popover reads.
    if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
    useAppStore.setState({
        notifications: [
            {
                id: "friend_request:f-2",
                eventType: "friend_request",
                actorUri: "https://aotearoa.nz/users/kai_r6z2m",
                displayName: "Kai Rewa",
                receivedAt: new Date().toISOString(),
                friendshipId: "f-2",
            },
        ],
    })
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ""
})

async function openBell() {
    client = new QueryClient()
    vi.spyOn(client, "invalidateQueries")
    const container = document.body.appendChild(document.createElement("div"))
    await act(async () => {
        root = createRoot(container)
        root.render(
            createElement(QueryClientProvider, { client }, createElement(BellProvider, null, createElement(NotificationsPopover))),
        )
    })
    await press((b) => b.getAttribute("aria-label")?.startsWith("Notifications") ?? false)
}

async function press(which: (button: HTMLButtonElement) => boolean) {
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(which)!.click())
}

describe("the bell's answer to a friend request", () => {
    it("reads the people found again once accepted", async () => {
        await openBell()

        await press((b) => b.textContent?.trim() === "Accept")

        expect(mocks.acceptFriendRequest).toHaveBeenCalledWith("https://idp.test", "access-1", "f-2")
        expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: peopleQueryKey("https://idp.test") })
    })

    it("reads the people found again once declined", async () => {
        await openBell()

        await press((b) => b.textContent?.trim() === "Decline")

        expect(mocks.rejectFriendRequest).toHaveBeenCalledWith("https://idp.test", "access-1", "f-2")
        expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: peopleQueryKey("https://idp.test") })
    })
})
