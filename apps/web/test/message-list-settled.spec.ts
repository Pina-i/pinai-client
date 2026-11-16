/** The message list counts as laid out once its height held still for three frames, 400 ms at most. */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSettled } from "@/presentation/organisms/MessageList/MessageList.scroll"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const observers: (() => void)[] = []
class FakeResizeObserver {
    #callback: () => void
    constructor(callback: () => void) {
        this.#callback = callback
    }
    observe() {
        observers.push(this.#callback)
    }
    disconnect() {
        observers.splice(observers.indexOf(this.#callback), 1)
    }
}
const resize = () => observers.forEach((callback) => callback())

// The scroll box and the virtualizer's sizer inside it.
const box = document.createElement("div")
box.appendChild(document.createElement("div"))
const scrollRef = { current: box }

function Probe({ hasItems, onSettle }: { hasItems: boolean; onSettle: () => void }) {
    useSettled(scrollRef, hasItems, onSettle)
    return null
}

let root: Root
const render = (hasItems: boolean, onSettle: () => void) =>
    act(() => root.render(createElement(Probe, { hasItems, onSettle })))
const frames = (n: number) => act(() => vi.advanceTimersByTime(n * 16))

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] })
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    root = createRoot(document.createElement("div"))
})

afterEach(() => {
    act(() => root.unmount())
    vi.unstubAllGlobals()
    vi.useRealTimers()
    observers.length = 0
})

describe("the message list settling", () => {
    it("waits for rows", () => {
        const onSettle = vi.fn()
        render(false, onSettle)
        frames(40)
        expect(onSettle).not.toHaveBeenCalled()
    })

    it("settles once its height held still for three frames, and only once", () => {
        const onSettle = vi.fn()
        render(true, onSettle)
        frames(2)
        resize()
        frames(2)
        expect(onSettle).not.toHaveBeenCalled()
        frames(1)
        expect(onSettle).toHaveBeenCalledTimes(1)
        frames(40)
        expect(onSettle).toHaveBeenCalledTimes(1)
    })

    it("settles past 400 ms anyway, should it never hold still", () => {
        const onSettle = vi.fn()
        render(true, onSettle)
        for (let i = 0; i < 24; i++) {
            resize()
            frames(1)
        }
        expect(onSettle).not.toHaveBeenCalled()
        resize()
        frames(2)
        expect(onSettle).toHaveBeenCalledTimes(1)
    })
})
