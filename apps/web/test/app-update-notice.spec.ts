/** The installed app's update, as a toast that stays until acted on. */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AppUpdate, IAppUpdatesPort } from "@pinai/domain/ports/app-updates.port"

const mocks = vi.hoisted(() => ({ toast: vi.fn(), port: undefined as unknown as IAppUpdatesPort }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@/ioc/index", () => ({ getAppUpdatesPort: () => mocks.port }))

const { noticeOf, useAppUpdateNoticeViewModel } = await import(
    "@/presentation/organisms/AppUpdateNotice/AppUpdateNotice.viewmodel"
)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    mocks.toast.mockClear()
})

async function mount(status: AppUpdate) {
    let changed: (update: AppUpdate) => void = () => {}
    const port: IAppUpdatesPort = {
        status: async () => status,
        onChange: (listener) => {
            changed = listener
            return () => {}
        },
        restart: vi.fn(async () => {}),
        download: vi.fn(async () => {}),
    }
    mocks.port = port
    function Probe() {
        useAppUpdateNoticeViewModel()
        return null
    }
    await act(async () => {
        root = createRoot(document.createElement("div"))
        root.render(createElement(Probe))
    })
    return { port, changed: (update: AppUpdate) => act(() => changed(update)) }
}

describe("noticeOf", () => {
    it("offers the restart once downloaded, the download on a Mac that can't install, nothing else", () => {
        expect(noticeOf({ kind: "ready", version: "0.2.0" })).toEqual({
            message: "An update is ready",
            description: "Version 0.2.0",
            action: { label: "Restart", run: "restart" },
        })
        expect(noticeOf({ kind: "available", version: "0.2.0" })).toEqual({
            message: "A new version is available",
            description: "Version 0.2.0",
            action: { label: "Download", run: "download" },
        })
        expect(noticeOf({ kind: "none" })).toBeNull()
    })
})

describe("useAppUpdateNoticeViewModel", () => {
    it("shows the update the app already has, then each newer one in place, as a toast that stays", async () => {
        const { changed } = await mount({ kind: "ready", version: "0.2.0" })

        expect(mocks.toast).toHaveBeenCalledOnce()
        expect(mocks.toast.mock.calls[0][0]).toBe("An update is ready")
        expect(mocks.toast.mock.calls[0][1]).toMatchObject({
            id: "app-update",
            duration: Infinity,
            closeButton: true,
            description: "Version 0.2.0",
        })

        await changed({ kind: "ready", version: "0.3.0" })

        expect(mocks.toast).toHaveBeenCalledTimes(2)
        expect(mocks.toast.mock.calls[1][1]).toMatchObject({ id: "app-update", description: "Version 0.3.0" })
    })

    it("shows nothing while there is no update", async () => {
        await mount({ kind: "none" })
        expect(mocks.toast).not.toHaveBeenCalled()
    })

    it("keeps the toast up on Restart, which asks the main process to install", async () => {
        const { port } = await mount({ kind: "ready", version: "0.2.0" })
        const event = { preventDefault: vi.fn() }

        mocks.toast.mock.calls[0][1].action.onClick(event)

        expect(event.preventDefault).toHaveBeenCalledOnce()
        expect(port.restart).toHaveBeenCalledOnce()
    })

    it("lets the toast go on Download, and swallows a refused download", async () => {
        const { port } = await mount({ kind: "available", version: "0.2.0" })
        // A plain function: a vi.fn() marks the promises it returns as handled
        const download = vi.fn()
        port.download = () => {
            download()
            return Promise.reject(new Error("no browser"))
        }
        const unhandled = vi.fn()
        process.on("unhandledRejection", unhandled)
        const event = { preventDefault: vi.fn() }

        mocks.toast.mock.calls[0][1].action.onClick(event)
        await new Promise((resolve) => setTimeout(resolve, 0))
        process.off("unhandledRejection", unhandled)

        expect(event.preventDefault).not.toHaveBeenCalled()
        expect(download).toHaveBeenCalledOnce()
        expect(unhandled).not.toHaveBeenCalled()
    })
})
