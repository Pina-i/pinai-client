/** Renaming a group: in the header, and from its row's menu. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement, createRef, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DmConversation } from "@/lib/types"
import { composeAt, endComposition, pressComposing, typeAt } from "./setup/name-field"

const mocks = vi.hoisted(() => ({ renameGroup: vi.fn(async () => ({})), toastError: vi.fn() }))
vi.mock("@/ioc/index", () => ({ getGroupPort: () => ({ renameGroup: mocks.renameGroup }) }))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("@/store/store", async () => {
    const { create } = await import("zustand")
    return { useAppStore: create(() => ({ accessToken: "access-1", idpUrl: "https://idp.test" })) }
})

const { GroupTitleEditor } = await import("@/presentation/organisms/AppHeader/GroupTitleEditor/GroupTitleEditor")
const { RenameGroupPopover } = await import(
    "@/presentation/organisms/ChannelSidebar/RenameGroupPopover/RenameGroupPopover"
)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ""
    mocks.renameGroup.mockClear()
    mocks.toastError.mockClear()
})

async function render(node: ReactNode) {
    const container = document.createElement("div")
    document.body.appendChild(container)
    await act(async () => {
        root = createRoot(container)
        root.render(createElement(QueryClientProvider, { client: new QueryClient() }, node))
    })
}

const ZWSP = String.fromCodePoint(0x200b)
const ZWJ = String.fromCodePoint(0x200d)
const FULL = "a".repeat(10) + "b".repeat(40)

const input = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Group name"]')!
const button = (name: string) =>
    [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.getAttribute("aria-label") === name || b.textContent === name,
    )!

async function type(value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => {
        setValue.call(input(), value)
        input().dispatchEvent(new Event("input", { bubbles: true }))
    })
}

async function press(key: string) {
    await act(async () => {
        input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
    })
}

function editor(groupName: string | null = "crew") {
    const onDone = vi.fn()
    return {
        onDone,
        node: createElement(GroupTitleEditor, {
            conversationId: "g1",
            groupName,
            placeholder: "Alice, Dave",
            onDone,
        }),
    }
}

describe("GroupTitleEditor", () => {
    it("starts from the group's name and sends the new one on Enter", async () => {
        const { node, onDone } = editor()
        await render(node)
        expect(input().value).toBe("crew")

        await type("  Weekend trip ")
        await press("Enter")

        expect(mocks.renameGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "g1", "Weekend trip")
        expect(onDone).toHaveBeenCalledOnce()
    })

    it("names a group that had none, its members' names as the placeholder", async () => {
        const { node } = editor(null)
        await render(node)
        expect(input().value).toBe("")
        expect(input().placeholder).toBe("Alice, Dave")

        await type("Weekend trip")
        await act(async () => button("Save name").click())

        expect(mocks.renameGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "g1", "Weekend trip")
    })

    it("leaves on Escape, and on Enter with the name unchanged, sending nothing", async () => {
        const first = editor()
        await render(first.node)
        await press("Escape")
        expect(first.onDone).toHaveBeenCalledOnce()

        await act(async () => root?.unmount())
        const second = editor()
        await render(second.node)
        await press("Enter")
        expect(second.onDone).toHaveBeenCalledOnce()
        expect(mocks.renameGroup).not.toHaveBeenCalled()
    })

    it("can't save a blank name", async () => {
        const { node, onDone } = editor()
        await render(node)

        await type("   ")
        await press("Enter")

        expect(button("Save name").disabled).toBe(true)
        expect(onDone).not.toHaveBeenCalled()
        expect(mocks.renameGroup).not.toHaveBeenCalled()
    })

    it("drops invisible characters before sending, and can't save a name with nothing readable", async () => {
        const { node, onDone } = editor()
        await render(node)

        await type(`${ZWSP}${ZWJ}`)
        await press("Enter")
        expect(button("Save name").disabled).toBe(true)
        expect(onDone).not.toHaveBeenCalled()
        expect(mocks.renameGroup).not.toHaveBeenCalled()

        await type(`Alice and Bob${ZWSP}`)
        await press("Enter")
        expect(mocks.renameGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "g1", "Alice and Bob")
    })

    it("holds 50 characters, an emoji counted once and never cut", async () => {
        const { node } = editor()
        await render(node)
        expect(input().hasAttribute("maxlength")).toBe(false)

        await type("😀".repeat(60))
        expect(input().value).toBe("😀".repeat(50))
        await press("Enter")

        expect(mocks.renameGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "g1", "😀".repeat(50))
    })

    it("keeps a full name's end when typing or pasting in its middle, the caret after what stayed", async () => {
        const { node } = editor(FULL)
        await render(node)

        await typeAt(input(), "X", 10)
        expect(input().value).toBe(FULL)
        expect(input().selectionStart).toBe(10)

        await type("a".repeat(20) + "b".repeat(25))
        await typeAt(input(), "X".repeat(10), 20)
        expect(input().value).toBe("a".repeat(20) + "X".repeat(5) + "b".repeat(25))
        expect(input().selectionStart).toBe(25)
    })

    it("lets an IME finish its syllable before holding the name to 50 characters", async () => {
        const { node } = editor(FULL)
        await render(node)

        await composeAt(input(), 10, ["ㅎ", "하"], { end: false })
        expect(input().value).toBe("a".repeat(10) + "하" + "b".repeat(40))
        await endComposition(input())
        expect(input().value).toBe(FULL)
        expect(input().selectionStart).toBe(10)

        await type("a".repeat(49))
        await composeAt(input(), 49, ["ㅎ", "하"])
        expect(input().value).toBe("a".repeat(49) + "하")
    })

    it("saves nothing and stays open on the Enter or Escape that ends an IME's composition", async () => {
        const { node, onDone } = editor(FULL)
        await render(node)

        await composeAt(input(), 10, ["ㅎ", "하"], { end: false })
        await pressComposing(input(), "Enter")
        await pressComposing(input(), "Escape")

        expect(mocks.renameGroup).not.toHaveBeenCalled()
        expect(onDone).not.toHaveBeenCalled()
        expect(input()).not.toBeNull()
    })

    it("stays open and says why when the rename fails", async () => {
        mocks.renameGroup.mockRejectedValueOnce(new Error("Group name is longer than 50 characters"))
        const { node, onDone } = editor()
        await render(node)

        await type("Weekend trip")
        await press("Enter")

        expect(mocks.toastError).toHaveBeenCalledWith("Group name is longer than 50 characters")
        expect(onDone).not.toHaveBeenCalled()
        expect(input()).not.toBeNull()
    })
})

describe("RenameGroupPopover", () => {
    const group = {
        id: "g1",
        kind: "group",
        groupName: "crew",
        displayName: "crew",
        address: "g1",
        memberCount: 3,
        memberNames: ["Alice", "Dave"],
        removedAt: null,
    } as DmConversation

    async function open() {
        // jsdom has no `CSS.escape`, which React Aria's popover reads.
        if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
        const anchor = document.createElement("button")
        document.body.appendChild(anchor)
        const anchorRef = createRef<HTMLElement>()
        anchorRef.current = anchor
        const onClose = vi.fn()
        await render(createElement(RenameGroupPopover, { group, anchorRef, onClose }))
        return { onClose }
    }

    it("shows how the new name will read, to how many, and renames only once it changed", async () => {
        const { onClose } = await open()
        const text = () => document.body.textContent ?? ""
        expect(text()).toContain("What should everyone call it?")
        expect(text()).toContain("4/50")
        expect(text()).toContain("all 3 members see the new name")
        expect(button("Rename").disabled).toBe(true)

        await type("Weekend trip")
        expect(text()).toContain("12/50")
        expect(text()).toContain("Weekend trip")
        await act(async () => button("Rename").click())

        expect(mocks.renameGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "g1", "Weekend trip")
        expect(onClose).toHaveBeenCalledOnce()
    })

    it("holds 50 characters at most", async () => {
        await open()

        await type("a".repeat(60))

        expect(input().value).toHaveLength(50)
    })

    it("counts an emoji once, cuts between whole ones, and renames to 50 of them", async () => {
        const { onClose } = await open()
        expect(input().hasAttribute("maxlength")).toBe(false)

        await type("😀".repeat(60))
        expect(input().value).toBe("😀".repeat(50))
        expect(document.body.textContent).toContain("50/50")
        await act(async () => button("Rename").click())

        expect(mocks.renameGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "g1", "😀".repeat(50))
        expect(onClose).toHaveBeenCalledOnce()
    })

    it("keeps a full name's end when typing or pasting in its middle, the caret after what stayed", async () => {
        await open()
        await type(FULL)

        await typeAt(input(), "X", 10)
        expect(input().value).toBe(FULL)
        expect(input().selectionStart).toBe(10)
        expect(document.body.textContent).toContain("50/50")

        await type("a".repeat(20) + "b".repeat(25))
        await typeAt(input(), "X".repeat(10), 20)
        expect(input().value).toBe("a".repeat(20) + "X".repeat(5) + "b".repeat(25))
        expect(input().selectionStart).toBe(25)
    })

    it("saves nothing and stays open on the Enter that ends an IME's composition", async () => {
        const { onClose } = await open()
        await type("Alice and Bob")

        await composeAt(input(), 13, ["ㅎ", "하"], { end: false })
        await pressComposing(input(), "Enter")

        expect(mocks.renameGroup).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
        expect(input()).not.toBeNull()
    })

    it("can't rename to a name with nothing readable, and sends one without its invisible characters", async () => {
        await open()

        await type(ZWSP)
        expect(button("Rename").disabled).toBe(true)

        await type(`Alice and Bob${ZWSP}`)
        await act(async () => button("Rename").click())
        expect(mocks.renameGroup).toHaveBeenCalledWith("https://idp.test", "access-1", "g1", "Alice and Bob")
    })
})
