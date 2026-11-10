/** The attention count in the window's title, and on the desktop app's icon through its bridge. */
import { readFileSync } from "fs"
import path from "path"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_TITLE } from "@pinai/domain/models/attention"
import type { UserProfile } from "@pinai/domain/models/auth"
import type { WsNotification } from "@pinai/domain/models/ws"
import type { IAppBadgePort } from "@pinai/domain/ports/app-badge.port"
import type { DmConversation } from "@/lib/types"
import type { DesktopBridge } from "@/adapters/desktop/desktop-bridge"

const mocks = vi.hoisted(() => ({
    port: undefined as unknown as IAppBadgePort,
    acceptFriendRequest: vi.fn(async () => {}),
}))
vi.mock("@/ioc/index", () => ({
    getAppBadgePort: () => mocks.port,
    getSocialPort: () => ({ acceptFriendRequest: mocks.acceptFriendRequest }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/store/store", async () => {
    const { create } = await import("zustand")
    return {
        useAppStore: create<{ notifications: WsNotification[] } & Record<string, unknown>>()((set) => ({
            user: null,
            localDmConvos: [],
            dmUnread: {},
            activeDm: null,
            notifications: [],
            accessToken: "access-1",
            idpUrl: "https://idp.test",
            dismissNotification: (id: string) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
            clearNotifications: () => set({ notifications: [] }),
        })),
    }
})

const { useAttention } = await import("@/presentation/hooks/use-attention")
const { useAppStore } = await import("@/store/store")
const { BellProvider } = await import("@/presentation/providers/BellProvider/BellProvider")
const { NotificationsPopover } = await import("@/presentation/organisms/AppHeader/NotificationsPopover/NotificationsPopover")
const { NotificationSettingsContext } = await import(
    "@/presentation/providers/AppearanceProvider/NotificationSettings.context"
)
const { BrowserAppBadgeAdapter } = await import("@/adapters/app-badge/app-badge-browser.adapter")
const { DesktopAppBadgeAdapter } = await import("@/adapters/desktop/app-badge-desktop.adapter")
const { drawBadge } = await import("@/adapters/desktop/badge-image")

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ME = { address: "me@idp.test" } as UserProfile

function conversation(id: string, removedAt: string | null = null): DmConversation {
    return { id, removedAt } as DmConversation
}

function friendRequest(id: string): WsNotification {
    return {
        id,
        eventType: "friend_request",
        actorUri: `https://idp.test/users/${id}`,
        displayName: `Person ${id}`,
        receivedAt: new Date().toISOString(),
        friendshipId: `friendship-${id}`,
    }
}

let root: Root | null = null
let container: HTMLElement | null = null
let counts: number[] = []

beforeEach(() => {
    document.title = APP_TITLE
    counts = []
    mocks.port = { setCount: vi.fn(async (count: number) => void counts.push(count)) }
    useAppStore.setState({
        user: ME,
        localDmConvos: [conversation("dm-alice"), conversation("group-surf")],
        dmUnread: { "dm-alice": 2, "group-surf": 1 },
        activeDm: null,
        notifications: [],
    })
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    container = null
    vi.restoreAllMocks()
})

/** The hook beside the real bell, sharing the real read mark, as the signed-in layout mounts them. */
async function mount({ mutedConversations = [] as string[] } = {}) {
    function Probe() {
        useAttention()
        return null
    }
    const settings = {
        notifications: { muteAll: false, muteAllUntil: null, mutedConversations },
        setConversationMuted: () => {},
        setMuteAll: () => {},
    }
    container = document.body.appendChild(document.createElement("div"))
    await act(async () => {
        root = createRoot(container!)
        root.render(
            createElement(
                QueryClientProvider,
                { client: new QueryClient() },
                createElement(
                    NotificationSettingsContext.Provider,
                    { value: settings },
                    createElement(BellProvider, null, createElement(Probe), createElement(NotificationsPopover)),
                ),
            ),
        )
    })
}

function buttonNamed(name: string): HTMLButtonElement {
    const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === name || b.getAttribute("aria-label")?.startsWith(name),
    )
    if (!button) throw new Error(`No button ${name}`)
    return button
}

async function press(name: string) {
    await act(async () => buttonNamed(name).click())
}

async function arrive(...notifications: WsNotification[]) {
    await act(async () =>
        useAppStore.setState((s) => ({ notifications: [...notifications, ...s.notifications] })),
    )
}

describe("useAttention", () => {
    it("is index.html's title with nothing waiting", () => {
        const html = readFileSync(path.resolve(import.meta.dirname, "../index.html"), "utf8")

        expect(html).toContain(`<title>${APP_TITLE}</title>`)
    })

    it("puts the count in the title and hands it to the icon", async () => {
        await mount()

        expect(document.title).toBe(`${APP_TITLE} (3)`)
        expect(counts).toEqual([3])
    })

    it("follows the unread pills live", async () => {
        await mount()

        await act(async () => useAppStore.setState({ dmUnread: { "dm-alice": 5, "group-surf": 1 } }))

        expect(document.title).toBe(`${APP_TITLE} (6)`)
        expect(counts).toEqual([3, 6])
    })

    it("counts the open conversation while nobody reads it, and not once the user is back", async () => {
        let focused = true
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
        vi.spyOn(document, "hasFocus").mockImplementation(() => focused)
        useAppStore.setState({ activeDm: "dm-alice", dmUnread: { "dm-alice": 2 } })
        await mount()
        expect(document.title).toBe(APP_TITLE)

        focused = false
        await act(async () => void window.dispatchEvent(new Event("blur")))
        expect(document.title).toBe(`${APP_TITLE} (2)`)

        focused = true
        await act(async () => void window.dispatchEvent(new Event("focus")))
        expect(document.title).toBe(APP_TITLE)
    })

    it("leaves out what is muted and hands nothing over when the count doesn't change", async () => {
        await mount({ mutedConversations: ["dm-alice"] })

        expect(document.title).toBe(`${APP_TITLE} (1)`)
        await act(async () => useAppStore.setState({ dmUnread: { "dm-alice": 8, "group-surf": 1 } }))
        expect(counts).toEqual([1])
    })

    it("restores the plain title and clears the icon at zero and on sign-out", async () => {
        await mount()

        await act(async () => useAppStore.setState({ dmUnread: {} }))
        expect(document.title).toBe(APP_TITLE)

        await act(async () => useAppStore.setState({ dmUnread: { "dm-alice": 1 } }))
        await act(async () => useAppStore.setState({ user: null }))
        expect(document.title).toBe(APP_TITLE)
        expect(counts).toEqual([3, 0, 1, 0])
    })

    it("restores the plain title and clears the icon when it unmounts", async () => {
        await mount()

        await act(async () => root?.unmount())
        root = null

        expect(document.title).toBe(APP_TITLE)
        expect(counts).toEqual([3, 0])
    })
})

describe("the bell's unread, read through the bell's own read mark", () => {
    // jsdom has no `CSS.escape`, which React Aria's popover reads.
    beforeEach(() => {
        if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
    })

    it("counts until the bell is opened, then drops by what it showed", async () => {
        useAppStore.setState({ notifications: [friendRequest("b"), friendRequest("a")] })
        await mount()
        expect(document.title).toBe(`${APP_TITLE} (5)`)

        await press("Notifications")

        expect(document.title).toBe(`${APP_TITLE} (3)`)
        expect(buttonNamed("Notifications").getAttribute("aria-label")).toBe("Notifications")
    })

    it("still counts a new one after a seen one was accepted", async () => {
        useAppStore.setState({ notifications: [friendRequest("b"), friendRequest("a")] })
        await mount()
        await press("Notifications")

        await press("Accept")
        expect(mocks.acceptFriendRequest).toHaveBeenCalledWith("https://idp.test", "access-1", "friendship-b")
        expect(useAppStore.getState().notifications.map((n) => n.id)).toEqual(["a"])
        expect(document.title).toBe(`${APP_TITLE} (3)`)

        await arrive(friendRequest("c"))

        expect(document.title).toBe(`${APP_TITLE} (4)`)
        expect(buttonNamed("Notifications").getAttribute("aria-label")).toBe("Notifications (1 unread)")
    })

    it("keeps what was unread at opening under Unread, and clears the bell with Mark all read", async () => {
        useAppStore.setState({ notifications: [friendRequest("b"), friendRequest("a")] })
        await mount()
        await press("Notifications")
        await arrive(friendRequest("c"))

        expect(document.body.textContent).toContain("2 new")
        await press("Unread")
        expect(document.body.textContent).toContain("Person b")
        expect(document.body.textContent).toContain("Person a")
        expect(document.body.textContent).not.toContain("Person c")

        await press("Mark all read")

        expect(document.title).toBe(`${APP_TITLE} (3)`)
        await arrive(friendRequest("d"))
        expect(document.title).toBe(`${APP_TITLE} (4)`)
    })
})

describe("the icon's badge", () => {
    it("goes to the desktop app's main process through its bridge, with Windows' picture", async () => {
        const setBadge = vi.fn(async () => {})
        const bridge = { window: { setBadge } } as unknown as DesktopBridge
        const port = new DesktopAppBadgeAdapter(bridge, (count) => (count > 0 ? `data:image/png;base64,${count}` : null))

        await port.setCount(4)
        await port.setCount(0)

        expect(setBadge.mock.calls).toEqual([
            [4, "data:image/png;base64,4"],
            [0, null],
        ])
    })

    it("does nothing in a browser and sends nothing, a bridge or not", async () => {
        const setBadge = vi.fn(async () => {})
        const page = window as { pinaiDesktop?: unknown }
        page.pinaiDesktop = { window: { setBadge } }
        document.title = "Some page"
        const port: IAppBadgePort = new BrowserAppBadgeAdapter()

        await expect(port.setCount(4)).resolves.toBeUndefined()

        expect(setBadge).not.toHaveBeenCalled()
        expect(document.title).toBe("Some page")
        delete page.pinaiDesktop
    })

    it("is drawn as a disc spelling the count, 99+ past 99", () => {
        const texts: string[] = []
        const context = {
            beginPath: () => {},
            arc: () => {},
            fill: () => {},
            fillText: (text: string) => void texts.push(text),
        }
        const getContext = vi
            .spyOn(HTMLCanvasElement.prototype, "getContext")
            .mockReturnValue(context as unknown as CanvasRenderingContext2D)
        const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA")

        expect(drawBadge(7)).toBe("data:image/png;base64,AAAA")
        expect(drawBadge(150)).toBe("data:image/png;base64,AAAA")
        expect(drawBadge(0)).toBeNull()
        expect(texts).toEqual(["7", "99+"])
        expect(toDataURL).toHaveBeenCalledWith("image/png")

        getContext.mockRestore()
        toDataURL.mockRestore()
    })
})
