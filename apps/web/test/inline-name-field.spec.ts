/** The device rename field (`InlineNameField`) held to its limit: what is typed or pasted is cut, never the name's end. */
import { act, createElement, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MAX_DEVICE_NAME_LENGTH } from "@pinai/domain/models/device"
import { InlineNameField } from "@/presentation/molecules/InlineNameField/InlineNameField"
import { composeAt, endComposition, pressComposing, typeAt } from "./setup/name-field"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FULL = "a".repeat(10) + "b".repeat(40)

const onSave = vi.fn()
const onCancel = vi.fn()

let root: Root | null = null

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ""
    onSave.mockClear()
    onCancel.mockClear()
})

function Field({ initial }: { initial: string }) {
    const [value, setValue] = useState(initial)
    return createElement(InlineNameField, {
        label: "Device name",
        value,
        onChange: setValue,
        maxLength: MAX_DEVICE_NAME_LENGTH,
        onSave,
        onCancel,
    })
}

async function render(initial: string) {
    const container = document.createElement("div")
    document.body.appendChild(container)
    await act(async () => {
        root = createRoot(container)
        root.render(createElement(Field, { initial }))
    })
}

const input = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Device name"]')!

describe("InlineNameField", () => {
    it("refuses a character typed in the middle of a full name, the caret where it was", async () => {
        await render(FULL)

        await typeAt(input(), "X", 10)

        expect(input().value).toBe(FULL)
        expect(input().selectionStart).toBe(10)
    })

    it("cuts a paste into the middle to the room left, never the name's end", async () => {
        await render("Alice's " + "b".repeat(37))

        await typeAt(input(), "laptop and phone", 8)

        expect(input().value).toBe("Alice's lapto" + "b".repeat(37))
        expect(input().selectionStart).toBe(13)
    })

    it("cuts a paste between whole emoji", async () => {
        const flag = String.fromCodePoint(0x1f1f3, 0x1f1ff)
        await render("a".repeat(47))

        await typeAt(input(), flag + flag, 47)

        expect(input().value).toBe("a".repeat(47) + flag)
    })

    it("lets an IME finish its syllable, then holds the name to the limit", async () => {
        await render(FULL)

        await composeAt(input(), 10, ["ㅎ", "하"], { end: false })
        expect(input().value).toBe("a".repeat(10) + "하" + "b".repeat(40))
        await endComposition(input())

        expect(input().value).toBe(FULL)
        expect(input().selectionStart).toBe(10)
    })

    it("holds the name to the limit in Firefox's order too: compositionend, then input", async () => {
        await render(FULL)

        await composeAt(input(), 10, ["ㅎ", "하"], { inputAfterEnd: true })
        expect(input().value).toBe(FULL)
        expect(input().selectionStart).toBe(10)

        await act(async () => root?.unmount())
        await render("a".repeat(49))
        await composeAt(input(), 49, ["ㅎ", "하"], { inputAfterEnd: true })
        expect(input().value).toBe("a".repeat(49) + "하")
    })

    it("saves nothing and stays open on the Enter or Escape that ends an IME's composition", async () => {
        await render(FULL)

        await composeAt(input(), 10, ["ㅎ", "하"], { end: false })
        await pressComposing(input(), "Enter")
        await pressComposing(input(), "Escape")

        expect(onSave).not.toHaveBeenCalled()
        expect(onCancel).not.toHaveBeenCalled()
        expect(input()).not.toBeNull()
    })
})
