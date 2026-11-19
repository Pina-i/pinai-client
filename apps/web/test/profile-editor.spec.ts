/** Saving a display name in Settings → Profile: the name as the IdP takes it, counted in characters. */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { UserApiAdapter } from "@pinai/api/user/user-api.adapter"
import type { ProfilePatch, UserProfile } from "@pinai/domain/models/auth"
import { typeAt } from "./setup/name-field"

const mocks = vi.hoisted(() => {
    const alice = {
        sub: "alice",
        preferred_username: "alice",
        display_name: "Alice",
        address: "alice@idp.test",
        actor_uri: "https://idp.test/users/alice",
        pronouns: null,
        bio: "",
    } as unknown as UserProfile
    return {
        alice,
        updateProfile: vi.fn(async (_idpUrl: string, _token: string, patch: ProfilePatch) => ({ ...alice, ...patch })),
        toast: { error: vi.fn(), success: vi.fn() },
        userPort: null as object | null,
    }
})
vi.mock("@/ioc", () => ({ getUserPort: () => mocks.userPort ?? { updateProfile: mocks.updateProfile } }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@/store/store", async () => {
    const { create } = await import("zustand")
    return {
        useAppStore: create<{ user: UserProfile } & Record<string, unknown>>()((set) => ({
            accessToken: "access-1",
            idpUrl: "https://idp.test",
            user: mocks.alice,
            setUser: (user: UserProfile) => set({ user }),
            setAvatarUrl: vi.fn(),
        })),
    }
})

const { ProfileEditor } = await import("@/presentation/pages/home/SettingsModal/ProfileEditor/ProfileEditor")
const { useAppStore } = await import("@/store/store")

// The signed-in profile, as Settings hands it: a save replaces it.
function Editor() {
    const user = useAppStore((s) => s.user)!
    return createElement(ProfileEditor, { user })
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ZWSP = String.fromCodePoint(0x200b)
const ZWJ = String.fromCodePoint(0x200d)

let root: Root | null = null

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ""
    mocks.updateProfile.mockClear()
    mocks.toast.error.mockClear()
    mocks.userPort = null
    useAppStore.setState({ user: mocks.alice })
    vi.unstubAllGlobals()
})

async function render() {
    const container = document.createElement("div")
    document.body.appendChild(container)
    await act(async () => {
        root = createRoot(container)
        root.render(createElement(Editor))
    })
}

const nameField = () => {
    const label = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.trim() === "Display name")!
    return document.getElementById(label.htmlFor) as HTMLInputElement
}
const saveButton = () =>
    [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Save")!

async function typeName(value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => {
        setValue.call(nameField(), value)
        nameField().dispatchEvent(new Event("input", { bubbles: true }))
    })
}

async function save() {
    await act(async () => saveButton().click())
}

const sentName = () => mocks.updateProfile.mock.calls[0]?.[2].display_name

describe("ProfileEditor's display name", () => {
    it("sends the name without its invisible characters", async () => {
        await render()

        await typeName(`Alice and Bob${ZWSP} `)
        await save()

        expect(sentName()).toBe("Alice and Bob")
    })

    it("treats a name of joiners alone as blank", async () => {
        await render()

        await typeName(`${ZWJ}${ZWJ}`)
        await save()

        expect(mocks.toast.error).toHaveBeenCalledWith("Display name cannot be blank.")
        expect(mocks.updateProfile).not.toHaveBeenCalled()
    })

    it("enables Save only for a change the save would make, and shows the name saved", async () => {
        await render()

        await typeName(`Alice${ZWSP} `)
        expect(saveButton().disabled).toBe(true)

        await typeName(`Alice and Bob${ZWSP} `)
        expect(saveButton().disabled).toBe(false)
        await save()

        expect(nameField().value).toBe("Alice and Bob")
        expect(saveButton().disabled).toBe(true)
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
    })

    it("holds 50 characters, an emoji counted once and never cut", async () => {
        await render()
        expect(nameField().hasAttribute("maxlength")).toBe(false)

        await typeName("😀".repeat(60))
        expect(nameField().value).toBe("😀".repeat(50))
        await save()

        expect(sentName()).toBe("😀".repeat(50))
    })

    it("says what the save's failure says, the draft kept", async () => {
        mocks.updateProfile.mockRejectedValueOnce(new Error("Failed to update profile: 400"))
        await render()

        await typeName("Bob")
        await save()

        expect(mocks.toast.error).toHaveBeenCalledWith("Failed to update profile: 400")
        expect(nameField().value).toBe("Bob")
    })

    it("shows the IdP's sentence when it refuses the name", async () => {
        mocks.userPort = new UserApiAdapter()
        const refusal = { error: "invalid_request", error_description: "display_name has characters that can't be shown" }
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify(refusal), { status: 400, headers: { "Content-Type": "application/json" } })),
        )
        await render()

        await typeName("Bob")
        await save()

        expect(mocks.toast.error).toHaveBeenCalledWith("display_name has characters that can't be shown")
        expect(nameField().value).toBe("Bob")
    })
})
