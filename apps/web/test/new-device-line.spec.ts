/** The line a conversation shows for someone's device that joined by itself, unproven, and its explanation. */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { describeNewDevice } from "@pinai/domain/models/new-device"
import { NewDeviceLine } from "@/presentation/molecules/NewDeviceLine/NewDeviceLine"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

beforeEach(() => {
    // jsdom has no `CSS.escape`, which React Aria's popover reads.
    if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
})

const { text, explanation } = describeNewDevice({ actorUri: "https://idp.alice.test/users/alice_k2m9x", displayName: "Alice" })

async function render() {
    const container = document.createElement("div")
    document.body.appendChild(container)
    await act(async () => {
        root = createRoot(container)
        root.render(createElement(NewDeviceLine, { text, explanation, timestamp: "10:00" }))
    })
    return container
}

const line = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent === text)!
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]')

describe("NewDeviceLine", () => {
    it("says who writes from a new device, with the commit's time, and nothing more until pressed", async () => {
        const container = await render()

        expect(line()).toBeTruthy()
        expect(container.textContent).toBe(`${text}10:00`)
        expect(dialog()).toBeNull()
        expect(document.body.textContent).not.toContain("someone else may be using")
    })

    it("explains itself when pressed, in a named dialog with no button of its own", async () => {
        await render()

        await act(async () => line().click())

        expect(dialog()?.getAttribute("aria-label")).toBe("About this new device")
        expect(dialog()?.textContent).toBe(explanation)
        expect(dialog()?.querySelector("button")).toBeNull()
        expect(line().getAttribute("aria-expanded")).toBe("true")
    })

    it("closes on Escape, the focus back on the line", async () => {
        await render()
        await act(async () => {
            line().focus()
            line().click()
        })

        await act(async () => {
            dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        })

        expect(dialog()).toBeNull()
        await vi.waitFor(() => expect(document.activeElement).toBe(line()))
    })
})
