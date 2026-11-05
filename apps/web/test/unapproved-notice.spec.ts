/**
 * A device nobody approved, told outside Settings → Devices (`identity-provider/specs/e2ee.md § 3.9`):
 * one toast the first time this device sees it — not again for a review, a remount or a reload —,
 * with the way to Settings → Devices, gone once it no longer stands. The review is the real engine's.
 */
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter, type AnyRouter } from "@tanstack/react-router"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { useUnapprovedDeviceNotice } from "@/presentation/hooks/use-unapproved-device-notice"

import { ACTOR, FakeHistoryIdp, FastSealer, IDP, MemoryHistoryStorage, historyDevice } from "./setup/history-idp"
import { FakeIssuers, approvedBy, approvedByPassphrase, listedDevice, testDevice, type TestDevice } from "./setup/issuers"

const wired = vi.hoisted(() => ({ e2ee: null as unknown }))
const toast = vi.hoisted(() => Object.assign(vi.fn(), { dismiss: vi.fn() }))
vi.mock("@/ioc", () => ({ getE2eePort: () => wired.e2ee, getAuthPort: vi.fn(), getAuthPlatform: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const issuers = new FakeIssuers()

async function account() {
    const idp = new FakeHistoryIdp()
    const storage = new MemoryHistoryStorage()
    const laptop = historyDevice(idp, "laptop", storage, issuers.jwks)
    const founded = await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    if (founded.kind !== "holds") throw new Error("the first device didn't set the key")
    const hak = await new FastSealer().deriveKey(founded.words, idp.key!.salt)
    const self: TestDevice = {
        actorUri: ACTOR,
        deviceId: laptop.storage.deviceId,
        rootKey: laptop.storage.rootKey,
        attestation: issuers.attest(ACTOR, laptop.storage.deviceId, laptop.storage.rootKey.publicKey),
    }
    const laptopRow = listedDevice(self, [approvedByPassphrase(hak, 1, self)], { display_name: "Firefox on Linux" })
    return { idp, storage, laptop, self, laptopRow }
}

let root: Root | null = null
let router: AnyRouter

function Notice() {
    useUnapprovedDeviceNotice()
    return null
}

async function render() {
    router = createRouter({ routeTree: createRootRoute({ component: Notice }), history: createMemoryHistory({ initialEntries: ["/home"] }) })
    root = createRoot(document.createElement("div"))
    await act(async () => root?.render(createElement(RouterProvider, { router })))
}

async function unmount() {
    const leaving = root
    root = null
    await act(async () => leaving?.unmount())
}

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    toast.mockReset()
    toast.dismiss.mockReset()
})

afterEach(async () => {
    await unmount()
    vi.restoreAllMocks()
})

describe("a device nobody approved, told outside the pane", () => {
    it("is told once, with the way to Settings → Devices, and taken back once approved", async () => {
        const { laptop, self, laptopRow } = await account()
        wired.e2ee = laptop.e2ee
        const phone = testDevice(issuers, ACTOR)
        const phoneRow = listedDevice(phone, [], { display_name: "Chrome on Android" })
        await render()
        const told = router

        await act(async () => void (await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, [laptopRow, phoneRow])))
        await act(async () => void (await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, [laptopRow, phoneRow])))
        await unmount()
        await render()

        expect(toast).toHaveBeenCalledTimes(1)
        const [message, options] = toast.mock.calls[0] as [string, { id: string; action: { label: string; onClick: () => void } }]
        expect(message).toBe("New device not approved: Chrome on Android. Not you? Sign it out.")
        expect(options.action.label).toBe("Open Devices")
        await act(async () => options.action.onClick())
        await vi.waitFor(() => expect(told.history.location.search).toBe("?settings=devices"))

        const approved = { ...phoneRow, approvals: [approvedBy(self, phone)] }
        await act(async () => void (await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, [laptopRow, approved])))
        expect(toast.dismiss).toHaveBeenCalledWith(options.id)
    })

    it("tells nothing of a device seen before this page load", async () => {
        const { idp, storage, laptop, laptopRow } = await account()
        const tablet = testDevice(issuers, ACTOR)
        const tabletRow = listedDevice(tablet, [], { display_name: "Safari on iPadOS" })
        await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, [laptopRow, tabletRow])

        const reloaded = historyDevice(idp, "laptop", storage, issuers.jwks)
        wired.e2ee = reloaded.e2ee
        await render()
        await act(async () => void (await reloaded.e2ee.reviewDevices(IDP, reloaded.token, ACTOR, [laptopRow, tabletRow])))

        expect(reloaded.e2ee.trustSnapshot().some((e) => e.kind === "unapproved-device")).toBe(true)
        expect(toast).not.toHaveBeenCalled()
    })
})
