/**
 * `onComplete` timing for `OtpInput`. Callers read the code from their own
 * state (Settings → Security, TOTP enroll) or from a form's hidden input, so
 * the callback must run only after the parent has committed the sixth digit. Rendered with raw `createRoot`
 * because the behaviour under test is React's commit order.
 */
import { createElement, act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
})

afterEach(() => {
    act(() => root.unmount())
    host.remove()
})

const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!

function cell(i: number): HTMLInputElement {
    return host.querySelector(`[aria-label="Digit ${i + 1} of 6"]`) as HTMLInputElement
}

function typeInto(i: number, text: string) {
    act(() => {
        setNativeValue.call(cell(i), text)
        cell(i).dispatchEvent(new Event("input", { bubbles: true }))
    })
}

function typeCode(code: string) {
    ;[...code].forEach((d, i) => typeInto(i, d))
}

/** Mirrors the callers: the submit handler ignores its argument and reads
 *  the code from the parent's state and the hidden form field. */
function Harness({ onSubmit, initial = "" }: { onSubmit: (seen: { state: string; field: string }) => void; initial?: string }) {
    const [code, setCode] = useState(initial)
    return createElement(OtpInput, {
        value: code,
        onChange: setCode,
        name: "code",
        onComplete: () =>
            onSubmit({
                state: code,
                field: (host.querySelector('input[name="code"]') as HTMLInputElement).value,
            }),
    })
}

function mount(onSubmit: (seen: { state: string; field: string }) => void, initial?: string) {
    act(() => root.render(createElement(Harness, { onSubmit, initial })))
}

describe("OtpInput onComplete", () => {
    it("fires once the sixth digit is committed, not before", () => {
        const onSubmit = vi.fn()
        mount(onSubmit)

        typeCode("12345")
        expect(onSubmit).not.toHaveBeenCalled()

        typeInto(5, "6")
        expect(onSubmit).toHaveBeenCalledTimes(1)
        expect(onSubmit).toHaveBeenCalledWith({ state: "123456", field: "123456" })
    })

    it("fires for a pasted code", () => {
        const onSubmit = vi.fn()
        mount(onSubmit)

        typeInto(0, "654321")

        expect(onSubmit).toHaveBeenCalledTimes(1)
        expect(onSubmit).toHaveBeenCalledWith({ state: "654321", field: "654321" })
    })

    it("does not fire again for the same code, but does after an edit", () => {
        const onSubmit = vi.fn()
        mount(onSubmit)
        typeCode("123456")

        act(() => root.render(createElement(Harness, { onSubmit })))
        expect(onSubmit).toHaveBeenCalledTimes(1)

        typeInto(5, "")
        typeInto(5, "7")
        expect(onSubmit).toHaveBeenCalledTimes(2)
        expect(onSubmit).toHaveBeenLastCalledWith({ state: "123457", field: "123457" })
    })

    it("does not fire for a value that is already complete on mount", () => {
        const onSubmit = vi.fn()
        mount(onSubmit, "123456")
        expect(onSubmit).not.toHaveBeenCalled()
    })
})
