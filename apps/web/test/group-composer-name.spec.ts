/** Naming a new group in the composer: the name as the IdP takes it, none when nothing readable is typed. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import { typeAt } from "./setup/name-field"

const BOB = {
    id: "https://idp.test/users/bob",
    name: "Bob",
    address: "bob@idp.test",
    avatarUrl: null,
    status: "online",
    activity: "",
}

const mocks = vi.hoisted(() => ({
    createGroup: vi.fn(async () => ({ conversationId: "g1" })),
    closeGroupComposer: vi.fn(),
}))
vi.mock("@/ioc", () => ({ getGroupPort: () => ({ createGroup: mocks.createGroup }), getE2eePort: () => ({}) }))
vi.mock("@pinai/domain/usecases/e2ee/distribute-group-keys.usecase", () => ({
    distributeGroupKeysUseCase: async () => ({ dropped: [], failed: [] }),
}))
vi.mock("@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel", () => ({
    useFriendsPanelViewModel: () => ({ friends: [BOB], isLoading: false }),
}))
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn() } }))
vi.mock("@/store/store", async () => {
    const { create } = await import("zustand")
    return {
        useAppStore: create(() => ({
            accessToken: "access-1",
            idpUrl: "https://idp.test",
            groupComposer: { mode: "create", prefillAddresses: [BOB.address], fromDmId: null, targetConversationId: null },
            closeGroupComposer: mocks.closeGroupComposer,
        })),
    }
})

const { GroupComposer } = await import("@/presentation/pages/home/GroupComposer/GroupComposer")

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ZWSP = String.fromCodePoint(0x200b)
const ZWJ = String.fromCodePoint(0x200d)

let root: Root | null = null

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ""
    mocks.createGroup.mockClear()
    mocks.closeGroupComposer.mockClear()
})

async function render() {
    // jsdom has no `CSS.escape`, which React Aria's modal reads.
    if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
    const container = document.createElement("div")
    document.body.appendChild(container)
    await act(async () => {
        root = createRoot(container)
        root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(GroupComposer)))
    })
}

const nameField = () => document.body.querySelector<HTMLInputElement>("#group-name")!
const createButton = () =>
    [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Create group")!

async function typeName(value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => {
        setValue.call(nameField(), value)
        nameField().dispatchEvent(new Event("input", { bubbles: true }))
    })
}

async function create() {
    await act(async () => createButton().click())
}

describe("GroupComposer's name", () => {
    it("creates the group under the name typed, its invisible characters dropped", async () => {
        await render()

        await typeName(` Alice and Bob${ZWSP} `)
        await create()

        expect(mocks.createGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "Alice and Bob", [BOB.id])
        expect(mocks.closeGroupComposer).toHaveBeenCalledOnce()
    })

    it("creates it unnamed, titled by its members, when nothing readable is typed", async () => {
        await render()

        await typeName(`${ZWSP}${ZWJ} `)
        await create()

        expect(mocks.createGroup).toHaveBeenCalledWith("https://idp.test", "access-1", null, [BOB.id])
    })

    it("keeps a full name's end when typing or pasting in its middle, the caret after what stayed", async () => {
        await render()
        const full = "a".repeat(10) + "b".repeat(40)
        await typeName(full)

        await typeAt(nameField(), "X", 10)
        expect(nameField().value).toBe(full)
        expect(nameField().selectionStart).toBe(10)

        await typeName("a".repeat(20) + "b".repeat(25))
        await typeAt(nameField(), "X".repeat(10), 20)
        expect(nameField().value).toBe("a".repeat(20) + "X".repeat(5) + "b".repeat(25))
        expect(nameField().selectionStart).toBe(25)
        await create()

        expect(mocks.createGroup).toHaveBeenCalledWith(
            "https://idp.test",
            "access-1",
            "a".repeat(20) + "X".repeat(5) + "b".repeat(25),
            [BOB.id],
        )
    })

    it("holds 50 characters, an emoji counted once and never cut", async () => {
        await render()
        expect(nameField().hasAttribute("maxlength")).toBe(false)

        await typeName("😀".repeat(60))
        expect(nameField().value).toBe("😀".repeat(50))
        await create()

        expect(mocks.createGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "😀".repeat(50), [BOB.id])
    })

    it("says what the IdP answered when it refuses the name, and stays open", async () => {
        mocks.createGroup.mockRejectedValueOnce(
            new IdpError(400, "invalid_request", "Group name has characters that can't be shown"),
        )
        await render()

        await typeName("Alice and Bob")
        await create()

        expect(document.body.textContent).toContain("Group name has characters that can't be shown")
        expect(mocks.closeGroupComposer).not.toHaveBeenCalled()
    })
})
