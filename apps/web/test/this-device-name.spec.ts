/**
 * "This device" before the list names it (`useThisDeviceName`): the `User-Agent`'s name at once,
 * the refined one once the hints arrive, and nothing set once the screen is gone.
 */
import { Activity, act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DeviceLabel } from "@pinai/domain/models/device-label"
import type { ThisDeviceLabel } from "@pinai/domain/usecases/e2ee/this-device-label.usecase"

const wired = vi.hoisted(() => ({ label: null as unknown }))
vi.mock("@/ioc", () => ({ getThisDeviceLabel: () => wired.label }))

const { useThisDeviceName } = await import("@/presentation/hooks/use-this-device-name")

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const named = (name: string): DeviceLabel => ({ name, kind: "phone", client: "browser" })

let root: Root
let container: HTMLElement
let renders: string[]
let settle: (label: DeviceLabel) => void

function Probe() {
    const name = useThisDeviceName()
    renders.push(name)
    return name
}

beforeEach(() => {
    renders = []
    const settled = new Promise<DeviceLabel>((resolve) => (settle = resolve))
    wired.label = { now: () => named("Chrome on Android"), settled: () => settled } satisfies ThisDeviceLabel
    container = document.createElement("div")
    root = createRoot(container)
})

afterEach(async () => {
    await act(async () => root.unmount())
})

describe("useThisDeviceName", () => {
    it("shows the User-Agent's name at once, then the refined one", async () => {
        await act(async () => root.render(createElement(Probe)))
        expect(container.textContent).toBe("Chrome on Android")

        await act(async () => settle(named("Chrome on Pixel 8")))

        expect(container.textContent).toBe("Chrome on Pixel 8")
    })

    it("sets nothing once its screen is gone", async () => {
        const screen = (mode: "visible" | "hidden") => createElement(Activity, { mode, children: createElement(Probe) })
        await act(async () => root.render(screen("visible")))
        // Hidden, its effects are cleaned up as on an unmount while its state lives on: an update would render it.
        await act(async () => root.render(screen("hidden")))
        const before = renders.length

        await act(async () => settle(named("Chrome on Pixel 8")))

        expect(renders).toHaveLength(before)
        expect(renders.at(-1)).toBe("Chrome on Android")
    })
})
