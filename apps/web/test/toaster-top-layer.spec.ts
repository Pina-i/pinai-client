/** The corner's toasts stay readable and pressable while a modal popover hides the rest of the page. */
import { act, createElement, Fragment } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/presentation/providers/AppearanceProvider/AppearanceProvider.context", () => ({
    useAppearance: () => ({ mode: "dark" }),
}))

const { AppToaster } = await import("@/presentation/organisms/AppToaster/AppToaster")
const { Popover } = await import("@/presentation/molecules/Popover/Popover")
const { Button } = await import("@/presentation/atoms/Button/Button")

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ""
})

describe("AppToaster", () => {
    it("is left out of what an open popover hides", async () => {
        // jsdom has no `CSS.escape`, which React Aria's popover reads.
        if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
        const container = document.createElement("div")
        document.body.appendChild(container)
        await act(async () => {
            root = createRoot(container)
            root.render(
                createElement(
                    Fragment,
                    null,
                    createElement(Popover, {
                        trigger: createElement(Button, null, "Open"),
                        label: "Panel",
                        children: "Inside",
                    }),
                    createElement("p", { id: "page" }, "The page"),
                    createElement(AppToaster),
                ),
            )
        })
        await act(async () => [...document.querySelectorAll("button")].find((b) => b.textContent === "Open")!.click())

        const hidden = (element: Element | null) =>
            !!element?.closest('[aria-hidden="true"], [inert]')
        expect(document.querySelector('[role="dialog"]')).not.toBeNull()
        expect(hidden(document.getElementById("page"))).toBe(true)
        expect(hidden(document.querySelector('section[aria-live="polite"]'))).toBe(false)
    })
})
