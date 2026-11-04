/**
 * The trust events of Settings → Devices (`identity-provider/specs/e2ee.md § 3.9`), as the real
 * E2EE engine's review of the device list stands and withdraws them: a device nobody approved shows
 * "not approved", its revoke reading "Not mine" — the revoke flow, its recent-password step
 * included —, only on a device acting on approval and until it is approved; a list naming a device
 * twice puts up a banner that goes with the next list that doesn't.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UserProfile } from "@pinai/domain/models/auth"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { IdpError } from "@pinai/domain/models/idp-error"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { DevicesEditor } from "@/presentation/pages/home/SettingsModal/DevicesEditor/DevicesEditor"
import { useAppStore } from "@/store/store"

import { ACTOR, FakeHistoryIdp, FastSealer, IDP, MemoryHistoryStorage, historyDevice } from "./setup/history-idp"
import { FakeIssuers, approvedBy, approvedByPassphrase, listedDevice, testDevice, type TestDevice } from "./setup/issuers"

const wired = vi.hoisted(() => ({
    e2ee: null as unknown,
    rows: [] as unknown[],
    markRevoked: null as unknown as (idpUrl: string, token: string, deviceId: string) => Promise<void>,
}))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.e2ee,
    getDeviceDirectoryPort: () => ({
        listDevices: async () => ({ devices: wired.rows }),
        markRevoked: (idpUrl: string, token: string, deviceId: string) => wired.markRevoked(idpUrl, token, deviceId),
    }),
    getHistoryArchivePort: vi.fn(),
    getSessionPort: vi.fn(),
    getAuthPort: vi.fn(),
    getAuthPlatform: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
// React Aria's modal needs more of a browser than jsdom has: what it is asked to say is enough here.
vi.mock("@/presentation/molecules/RecentSignInModal/RecentSignInModal", () => ({
    RecentSignInModal: ({ action }: { action: string | null }) => (action ? `To ${action}, sign in again` : null),
}))

const issuers = new FakeIssuers()

/** A laptop holding generation 1, approved by its words, and a phone signed in that nobody approved. */
async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop", new MemoryHistoryStorage(), issuers.jwks)
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
    const phone = testDevice(issuers, ACTOR)
    const phoneRow = listedDevice(phone, [], { display_name: "Chrome on Android" })
    vi.spyOn(laptop.e2ee, "revokeDevice").mockResolvedValue({ removed_from: [] })
    wired.e2ee = laptop.e2ee
    useAppStore.setState({ idpUrl: IDP, accessToken: laptop.token, user: { actor_uri: ACTOR } as UserProfile, localDmConvos: [] })
    return { idp, laptop, self, laptopRow, phone, phoneRow }
}

let root: Root | null = null
let container: HTMLElement
let client: QueryClient

async function render(): Promise<void> {
    const router = createRouter({
        routeTree: createRootRoute({ component: DevicesEditor }),
        history: createMemoryHistory({ initialEntries: ["/home"] }),
    })
    client = new QueryClient()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root?.render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })))
    })
}

async function until(check: () => boolean) {
    for (let i = 0; i < 200 && !check(); i++) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5)
        })
    }
    expect(check()).toBe(true)
}

/** The list as served now, the pane reading it again. */
async function serve(rows: DeviceListEntry[]) {
    wired.rows = rows
    await act(async () => {
        await client.invalidateQueries()
    })
}

const card = (name: string) =>
    [...container.querySelectorAll("div.rounded-\\[14px\\]")].find((d) => d.querySelector(".title")?.textContent === name)
const buttonIn = (element: Element | undefined, label: string) =>
    [...(element?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === label)
const BANNER = "Your instance sent a device list naming a device twice."

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    wired.markRevoked = vi.fn(async () => undefined)
})

afterEach(async () => {
    if (root) {
        const leaving = root
        root = null
        await act(async () => leaving.unmount())
        container.remove()
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("Settings → Devices", () => {
    it("shows a device nobody approved as “not approved” with “Not mine”, until it is approved", async () => {
        const { laptop, self, laptopRow, phone, phoneRow } = await account()
        const rows = [laptopRow, phoneRow]
        await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, rows)
        wired.rows = rows
        await render()
        await until(() => card("Chrome on Android") !== undefined)

        expect(card("Chrome on Android")?.textContent).toContain("not approved")
        expect(buttonIn(card("Chrome on Android"), "Not mine")?.getAttribute("aria-label")).toBe("Not mine: sign out Chrome on Android")
        expect(card("Firefox on Linux")?.textContent).not.toContain("not approved")

        const approved = [laptopRow, { ...phoneRow, approvals: [approvedBy(self, phone)] }]
        await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, approved)
        await serve(approved)
        await until(() => buttonIn(card("Chrome on Android"), "Revoke") !== undefined)
        expect(card("Chrome on Android")?.textContent).not.toContain("not approved")
        expect(buttonIn(card("Chrome on Android"), "Revoke")?.getAttribute("aria-label")).toBe("Revoke Chrome on Android")
    })

    it("revokes with “Not mine”, through the recent-password step when the IdP asks it", async () => {
        const { laptop, laptopRow, phone, phoneRow } = await account()
        await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, [laptopRow, phoneRow])
        wired.rows = [laptopRow, phoneRow]
        const markRevoked = vi.fn<(idpUrl: string, token: string, deviceId: string) => Promise<void>>()
        markRevoked.mockRejectedValueOnce(new IdpError(401, "insufficient_user_authentication", "Sign in again"))
        markRevoked.mockResolvedValue(undefined)
        wired.markRevoked = markRevoked
        await render()
        await until(() => buttonIn(card("Chrome on Android"), "Not mine") !== undefined)

        await act(async () => buttonIn(card("Chrome on Android"), "Not mine")?.click())
        await until(() => document.body.textContent?.includes("To revoke a device, sign in again") === true)
        expect(laptop.e2ee.revokeDevice).not.toHaveBeenCalled()

        await act(async () => buttonIn(card("Chrome on Android"), "Not mine")?.click())
        await until(() => vi.mocked(laptop.e2ee.revokeDevice).mock.calls.length === 1)
        expect(markRevoked).toHaveBeenLastCalledWith(IDP, laptop.token, phone.deviceId)
        expect(vi.mocked(laptop.e2ee.revokeDevice).mock.calls[0][3]).toBe(phone.deviceId)
    })

    it("shows nothing unapproved on a device that doesn't act: one that lost the current passphrase withdraws it", async () => {
        const { idp, laptop, laptopRow, phoneRow } = await account()
        const rows = [laptopRow, phoneRow]
        await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, rows)
        wired.rows = rows
        await render()
        await until(() => buttonIn(card("Chrome on Android"), "Not mine") !== undefined)

        const other = historyDevice(idp, "elsewhere")
        await idp.session().linkDevice(IDP, other.token, other.storage.deviceId)
        await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey(2)).key)
        await act(async () => {
            await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, rows)
        })

        await until(() => buttonIn(card("Chrome on Android"), "Revoke") !== undefined)
        expect(container.textContent).not.toContain("not approved")
    })

    it("puts up a banner for a list naming a device twice, gone with the next list that doesn't", async () => {
        const { laptop, laptopRow, phoneRow } = await account()
        const twice = [laptopRow, phoneRow, { ...phoneRow, display_name: "Another" }]
        wired.rows = [laptopRow, phoneRow]
        await render()
        const region = container.querySelector("[role=status]")
        expect(region?.textContent).toBe("")
        await act(async () => {
            await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, twice)
        })
        await until(() => container.textContent?.includes(BANNER) === true)
        expect(container.querySelector("[role=status]")).toBe(region)
        expect(region?.textContent).toContain("Nothing new is trusted on this device until it stops.")

        await act(async () => {
            await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, [laptopRow, phoneRow])
        })
        await until(() => container.textContent?.includes(BANNER) === false)
    })
})
