/** Settings → Notifications' "Keep Pīna'i running…": the desktop app's only, kept by its main process. */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ComesBackBy, IKeepRunningPort } from "@pinai/domain/ports/keep-running.port"
import type { DesktopBridge } from "@/adapters/desktop/desktop-bridge"
import { DesktopKeepRunningAdapter } from "@/adapters/desktop/keep-running-desktop.adapter"

const mocks = vi.hoisted(() => ({ toast: { error: vi.fn() }, port: null as IKeepRunningPort | null }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@/ioc", () => ({ getKeepRunningPort: () => mocks.port }))

const { KEEP_RUNNING_LABEL, keepRunningDescription, useNotificationsEditorViewModel } = await import(
    "@/presentation/pages/home/SettingsModal/NotificationsEditor/NotificationsEditor.viewmodel"
)
type ViewModel = import("@/presentation/pages/home/SettingsModal/NotificationsEditor/NotificationsEditor.viewmodel").NotificationsEditorViewModel

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    mocks.port = null
    mocks.toast.error.mockClear()
})

async function mount(port: IKeepRunningPort | null) {
    mocks.port = port
    const seen: { current: ViewModel | null } = { current: null }
    function Probe() {
        seen.current = useNotificationsEditorViewModel()
        return null
    }
    await act(async () => {
        root = createRoot(document.createElement("div"))
        root.render(createElement(Probe))
    })
    return seen
}

function port(kept: boolean, set: IKeepRunningPort["set"] = async () => {}, comesBackBy: ComesBackBy = "tray") {
    return { get: vi.fn(async () => ({ keepRunning: kept, comesBackBy })), set: vi.fn(set) }
}

describe("DesktopKeepRunningAdapter", () => {
    it("reads and sets the choice through the bridge", async () => {
        const keepRunning = vi.fn(async () => ({ keepRunning: false, comesBackBy: "dock" as const }))
        const setKeepRunning = vi.fn(async () => {})
        const adapter = new DesktopKeepRunningAdapter({ window: { keepRunning, setKeepRunning } } as unknown as DesktopBridge)

        await expect(adapter.get()).resolves.toEqual({ keepRunning: false, comesBackBy: "dock" })
        await adapter.set(true)

        expect(setKeepRunning).toHaveBeenCalledWith(true)
    })
})

describe("the wording", () => {
    it("is one label everywhere, and says how the window comes back", () => {
        expect(KEEP_RUNNING_LABEL).toBe("Keep receiving messages when the window is closed")
        expect(keepRunningDescription("tray")).toMatch(/tray.*dot.*Ctrl\+Q/)
        expect(keepRunningDescription("dock")).toMatch(/Dock.*⌘Q/)
        expect(keepRunningDescription("launch")).toContain("open it again to bring the window back")
    })
})

describe("useNotificationsEditorViewModel", () => {
    it("shows no switch in a browser", async () => {
        const vm = await mount(null)
        expect(vm.current?.keepRunning).toEqual({ kind: "absent" })
    })

    it("shows the main process's choice once it answered, worded for how the window comes back", async () => {
        const vm = await mount(port(false, async () => {}, "launch"))

        expect(vm.current?.keepRunning).toEqual({
            kind: "shown",
            label: KEEP_RUNNING_LABEL,
            description: keepRunningDescription("launch"),
            isSelected: false,
        })
    })

    it("shows neither on nor off while the main process hasn't answered", async () => {
        const vm = await mount({ get: () => new Promise(() => {}), set: async () => {} })

        expect(vm.current?.keepRunning).toEqual({ kind: "pending", label: KEEP_RUNNING_LABEL })
        vm.current?.setKeepRunning(false)
        expect(vm.current?.keepRunning).toEqual({ kind: "pending", label: KEEP_RUNNING_LABEL })
    })

    it("sets the choice", async () => {
        const kept = port(true)
        const vm = await mount(kept)

        await act(async () => vm.current?.setKeepRunning(false))

        expect(kept.set).toHaveBeenCalledWith(false)
        expect(vm.current?.keepRunning).toMatchObject({ isSelected: false })
    })

    it("puts the switch back when the main process couldn't save it, and says so", async () => {
        const kept = port(true, async () => {
            throw new Error("The choice couldn't be saved")
        })
        const vm = await mount(kept)

        await act(async () => vm.current?.setKeepRunning(false))

        expect(vm.current?.keepRunning).toMatchObject({ isSelected: true })
        expect(mocks.toast.error).toHaveBeenCalledOnce()
    })

    it("shows no switch when the choice can't be read", async () => {
        const vm = await mount({ get: async () => Promise.reject(new Error("gone")), set: async () => {} })
        expect(vm.current?.keepRunning).toEqual({ kind: "absent" })
    })
})
