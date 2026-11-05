/**
 * Settings → Devices as the real E2EE engine's review leaves it (`identity-provider/specs/e2ee.md
 * § 3.9`): the passphrase card on a device holding the current passphrase — held by how many, its
 * line, Show / Copy, "Clear history backup" (entries only, confirmed, a recent password) —, "Restore
 * history" only on a device that doesn't hold it; each row's tags and facts, "approved by" from this
 * device's own verdict; no "Pair new"; the footer.
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
import { deviceFingerprint } from "@/presentation/_libs/device-fingerprint"
import { DevicesEditor } from "@/presentation/pages/home/SettingsModal/DevicesEditor/DevicesEditor"
import { useAppStore } from "@/store/store"

import { ACTOR, FakeHistoryIdp, FastSealer, IDP, MemoryHistoryStorage, historyDevice } from "./setup/history-idp"
import { FakeIssuers, approvedBy, approvedByPassphrase, listedDevice, testDevice, type TestDevice } from "./setup/issuers"

const wired = vi.hoisted(() => ({ e2ee: null as unknown, rows: [] as unknown[], history: null as unknown }))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.e2ee,
    getDeviceDirectoryPort: () => ({ listDevices: async () => ({ devices: wired.rows }), markRevoked: async () => undefined }),
    getHistoryArchivePort: () => wired.history,
    getSessionPort: vi.fn(),
    getAuthPort: vi.fn(),
    getAuthPlatform: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
vi.mock("@/presentation/molecules/RecentSignInModal/RecentSignInModal", () => ({
    RecentSignInModal: ({ action }: { action: string | null }) => (action ? `To ${action}, sign in again` : null),
}))

const issuers = new FakeIssuers()

/**
 * A laptop holding generation 1 by its words; a phone it approved with a code, which approved it back
 * and holds the words too; a tablet approved by its own words, signed out and not saying it holds
 * them; a revoked one.
 */
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
    const phone = testDevice(issuers, ACTOR)
    const tablet = testDevice(issuers, ACTOR)
    const old = testDevice(issuers, ACTOR)
    // The handshake left approvals both ways: the laptop's of the phone first, the phone's back after; then the phone approved itself with the shared words.
    const back = { ...approvedBy(phone, self), created_at: "2026-11-02T00:00:05Z" }
    const rows: DeviceListEntry[] = [
        listedDevice(self, [approvedByPassphrase(hak, 1, self), back], { display_name: "Firefox on Linux", history_generation: 1 }),
        listedDevice(phone, [approvedBy(self, phone), approvedByPassphrase(hak, 1, phone)], {
            display_name: "Pixel 8",
            kind: "phone",
            history_generation: 1,
        }),
        listedDevice(tablet, [approvedByPassphrase(hak, 1, tablet)], {
            display_name: "Studio iMac",
            signed_in: false,
            last_seen_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        }),
        listedDevice(old, [], { display_name: "Old laptop", revoked_at: "2026-07-21T00:00:00Z", history_generation: 1 }),
    ]
    useAppStore.setState({ idpUrl: IDP, accessToken: laptop.token, user: { actor_uri: ACTOR } as UserProfile, localDmConvos: [] })
    return { idp, laptop, words: founded.words, rows, phone, tablet }
}

let root: Root | null = null
let container: HTMLElement

async function render(): Promise<void> {
    const router = createRouter({
        routeTree: createRootRoute({ component: DevicesEditor }),
        history: createMemoryHistory({ initialEntries: ["/home"] }),
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root?.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router })))
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

const card = (name: string) =>
    [...container.querySelectorAll("div.rounded-\\[14px\\]")].find((d) => d.querySelector(".title")?.textContent === name)
const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)
const restoreLink = () => [...container.querySelectorAll("a")].find((a) => a.textContent?.includes("Restore history"))

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
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
    it("says what each device is: this one, signed out, holding the history, who approved it, paired when, its short id", async () => {
        const { laptop, rows, phone, tablet } = await account()
        wired.e2ee = laptop.e2ee
        wired.rows = rows
        await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, rows)
        await render()
        await until(() => card("Pixel 8")?.textContent?.includes("approved by") === true)

        const text = (name: string) => card(name)?.textContent ?? ""
        expect(text("Firefox on Linux")).toContain("this device")
        expect(text("Firefox on Linux")).toContain("holds history")
        expect(text("Firefox on Linux")).toContain("Active now")
        expect(text("Firefox on Linux")).toContain("approved by your 24 words")
        expect(text("Pixel 8")).toContain("approved by this device")
        expect(text("Pixel 8")).toContain("holds history")
        expect(text("Pixel 8")).toContain(`paired ${new Date(rows[1].paired_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`)
        expect(text("Pixel 8")).toContain(deviceFingerprint(phone.deviceId))
        expect(button("Revoke")?.getAttribute("aria-label")).toBe("Revoke Pixel 8")
        expect(text("Studio iMac")).toContain("signed out")
        expect(text("Studio iMac")).toContain("Last seen 3 days ago")
        expect(text("Studio iMac")).toContain("approved by your 24 words")
        expect(text("Studio iMac")).not.toContain("holds history")
        expect(text("Studio iMac")).toContain(deviceFingerprint(tablet.deviceId))
        expect(text("Old laptop")).toContain("revoked")
        expect(text("Old laptop")).not.toContain("holds history")
        expect(text("Old laptop")).not.toContain("approved by")
        expect(container.textContent).not.toContain("waiting")
    })

    it("shows the words held, by how many devices, with the line about them, and offers no “Restore history” nor “Pair new”", async () => {
        const { laptop, rows, words } = await account()
        wired.e2ee = laptop.e2ee
        wired.rows = rows
        const writeText = vi.fn(async () => undefined)
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
        await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, rows)
        await render()
        await until(() => container.textContent?.includes("held by 2 devices") === true)

        expect(container.textContent).toContain("history passphrase · 24 words · held by 2 devices")
        expect(container.textContent).toContain("Your key to past conversations.")
        expect(container.textContent).toContain(
            "With these words and your password, someone can read your history and approve a device as you.",
        )
        expect(container.textContent).toContain(
            "These are the places you're signed in to Pīna'i. Only approved devices read your conversations and hold your history; sign out anything that isn't you.",
        )
        expect(container.textContent).toContain("Don't recognize a device? Sign it out — your passphrase still works everywhere else.")
        expect(restoreLink()).toBeUndefined()
        expect(container.textContent).not.toContain("Pair new")

        expect(button("Copy")?.disabled).toBe(true)
        await act(async () => button("Show")?.click())
        await act(async () => button("Copy")?.click())
        expect(writeText).toHaveBeenCalledWith(words.join(" "))
    })

    it("clears the saved entries only once confirmed, asking the password again when the IdP does", async () => {
        const { idp, laptop, rows } = await account()
        wired.e2ee = laptop.e2ee
        wired.rows = rows
        wired.history = idp
        const wipe = vi.spyOn(idp, "wipeArchive")
        wipe.mockRejectedValueOnce(new IdpError(401, "insufficient_user_authentication", "Sign in again"))
        await render()
        await until(() => button("Clear history backup") !== undefined)

        await act(async () => button("Clear history backup")?.click())
        expect(wipe).not.toHaveBeenCalled()
        await act(async () => button("Confirm clear")?.click())
        await until(() => container.textContent?.includes("To clear the history backup, sign in again") === true)

        await act(async () => button("Clear history backup")?.click())
        await act(async () => button("Confirm clear")?.click())
        await until(() => wipe.mock.calls.length === 2)
        expect(await laptop.e2ee.loadStoredPassphrase()).toHaveLength(24)
        expect(idp.key?.generation).toBe(1)
    })

    it("offers “Restore history” and no words on a device that doesn't hold the current passphrase, naming no approver nor holder", async () => {
        const { idp, rows } = await account()
        const fresh = historyDevice(idp, "fresh", new MemoryHistoryStorage(), issuers.jwks)
        await idp.session().linkDevice(IDP, fresh.token, fresh.storage.deviceId)
        expect(await fresh.e2ee.checkHistoryKey(IDP, fresh.token)).toMatchObject({ kind: "no-passphrase" })
        wired.e2ee = fresh.e2ee
        wired.rows = rows
        useAppStore.setState({ accessToken: fresh.token })
        await fresh.e2ee.reviewDevices(IDP, fresh.token, ACTOR, rows)
        await render()
        await until(() => restoreLink() !== undefined)

        expect(restoreLink()?.getAttribute("href")).toBe("/onboarding/recovery-restore")
        expect(container.textContent).not.toContain("history passphrase")
        expect(container.textContent).not.toContain("approved by")
        expect(container.textContent).not.toContain("holds history")
    })
})
