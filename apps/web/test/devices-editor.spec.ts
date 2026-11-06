/**
 * Settings → Devices as the real E2EE engine's review leaves it (`identity-provider/specs/e2ee.md
 * § 3.9`): the passphrase card on a device holding the current passphrase — held by how many, its
 * line, Show / Copy, "Clear history backup" (entries only, confirmed, a recent password), "Replace my
 * words" (confirmed in plain words, a recent password asked before anything is minted, the new words
 * shown over Settings until Continue, the re-archive started) —, "Restore history" only on a device
 * that doesn't hold it; each row's tags and facts, "approved by" from this device's own verdict; no
 * "Pair new"; the footer.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { KeptWordsReset } from "@pinai/domain/models/admission"
import type { UserProfile } from "@pinai/domain/models/auth"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { IdpError } from "@pinai/domain/models/idp-error"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { replaceWordsUseCase } from "@pinai/domain/usecases/e2ee/replace-words.usecase"
import { deviceFingerprint } from "@/presentation/_libs/device-fingerprint"
import { DevicesEditor } from "@/presentation/pages/home/SettingsModal/DevicesEditor/DevicesEditor"
import { HistoryResetContext } from "@/presentation/providers/HistoryResetProvider/HistoryReset.context"
import { useAppStore } from "@/store/store"

import { accessToken } from "./setup/access-token"
import { ACTOR, FakeHistoryIdp, FastSealer, IDP, MemoryHistoryStorage, historyDevice, nameSession } from "./setup/history-idp"
import { FakeIssuers, approvedBy, approvedByPassphrase, listedDevice, testDevice, type TestDevice } from "./setup/issuers"

const wired = vi.hoisted(() => ({
    e2ee: null as unknown,
    rows: [] as unknown[],
    history: null as unknown,
    session: null as unknown,
    /** The IdP's approval and report routes, for a flow that ends in them. */
    directory: {} as object,
}))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.e2ee,
    getDeviceDirectoryPort: () => ({
        markRevoked: async () => undefined,
        ...wired.directory,
        listDevices: async () => ({ devices: wired.rows }),
    }),
    getHistoryArchivePort: () => wired.history,
    getSessionPort: () => wired.session,
    getKeySharePort: () => undefined,
    getAuthPort: vi.fn(),
    getAuthPlatform: vi.fn(),
    getSessionRenewal: vi.fn(),
}))
const rearchive = vi.hoisted(() => ({ run: vi.fn(async () => ({ kind: "idle" })) }))
vi.mock("@/presentation/_libs/history-rearchive", () => ({ rearchiveDueHistory: rearchive.run }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }))
vi.mock("sonner", () => ({ toast: toasts }))
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

async function render(reset: KeptWordsReset | null = null): Promise<void> {
    const recheck = async () => "checked" as const
    const router = createRouter({
        routeTree: createRootRoute({
            component: () => createElement(HistoryResetContext.Provider, { value: { reset, recheck } }, createElement(DevicesEditor)),
        }),
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
const button = (label: string, within: ParentNode = container) =>
    [...within.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)
const dialog = (name: string) => document.body.querySelector<HTMLElement>(`[role="dialog"][aria-label="${name}"]`)
const restoreLink = () => [...container.querySelectorAll("a")].find((a) => a.textContent?.includes("Restore history"))

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    wired.directory = {}
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
    it("on a device that isn't approved, withholds Revoke on the devices the instance counts approved, saying why, and keeps it on the others", async () => {
        const { idp, rows } = await account()
        const web = historyDevice(idp, "web", new MemoryHistoryStorage(), issuers.jwks)
        await nameSession(web)
        const self: TestDevice = {
            actorUri: ACTOR,
            deviceId: web.storage.deviceId,
            rootKey: web.storage.rootKey,
            attestation: issuers.attest(ACTOR, web.storage.deviceId, web.storage.rootKey.publicKey),
        }
        const stranger = testDevice(issuers, ACTOR)
        wired.e2ee = web.e2ee
        wired.history = idp
        wired.rows = [
            ...rows,
            listedDevice(self, [], { display_name: "Chrome on Windows" }),
            listedDevice(stranger, [], { display_name: "Edge on Windows" }),
        ]
        useAppStore.setState({ accessToken: web.token })
        await render({ cause: "reset-by-unapproved", setter: rows[0].device_id })
        await until(() => card("Firefox on Linux")?.textContent?.includes("Only an approved device can remove an approved device") === true)

        for (const name of ["Firefox on Linux", "Pixel 8", "Studio iMac"]) {
            expect(card(name)?.textContent).toContain("Only an approved device can remove an approved device")
            expect(container.querySelector(`button[aria-label="Revoke ${name}"]`)).toBeNull()
        }
        expect(container.querySelector('button[aria-label="Revoke Edge on Windows"]')).not.toBeNull()
        expect(card("Edge on Windows")?.textContent).not.toContain("Only an approved device")

        // Refused anyway — the instance's word changed meanwhile —, it is said, nothing else.
        wired.directory = { markRevoked: async () => Promise.reject(new IdpError(403, "approval_required", "refused")) }
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Revoke Edge on Windows"]')?.click())
        await until(() => toasts.error.mock.calls.some(([message]) => message === "Only an approved device can remove an approved device."))
    })

    it("withholds nothing on a device the instance counts approved", async () => {
        const { idp, laptop, rows } = await account()
        wired.e2ee = laptop.e2ee
        wired.history = idp
        wired.rows = rows
        const counted = vi.spyOn(laptop.e2ee, "approvedAsTheInstanceCounts")
        await render()
        await until(() => counted.mock.calls.length > 0 && button("Revoke") !== undefined)
        await expect(counted.mock.results[0].value).resolves.toContain(laptop.storage.deviceId)
        expect(container.textContent).not.toContain("Only an approved device")
    })

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
        await nameSession(fresh)
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

describe("Settings → Devices: replacing the words", () => {
    beforeEach(() => {
        // jsdom has no `CSS.escape`, which React Aria's modal reads.
        if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
        vi.spyOn(useAppStore.persist, "hasHydrated").mockReturnValue(true)
    })

    const press = (label: string, within?: ParentNode) => act(async () => button(label, within)?.click())
    const confirmIt = async () => {
        await press("Replace my words")
        await press("Replace my words", dialog("Replace your 24 words?")!)
    }

    /** The laptop wired as the device the pane runs on, its IdP's routes behind every port. */
    function wire(device: ReturnType<typeof historyDevice>, idp: FakeHistoryIdp, rows: DeviceListEntry[]) {
        wired.e2ee = device.e2ee
        wired.rows = rows
        wired.history = idp
        wired.session = idp.session()
        wired.directory = idp.directory()
        rearchive.run.mockClear()
    }

    it("on a device holding the words: “Replace my words” confirms in plain words first, and Cancel mints nothing", async () => {
        const { idp, laptop, rows } = await account()
        wire(laptop, idp, rows)
        await render()
        await until(() => button("Replace my words") !== undefined)

        await act(async () => button("Replace my words")?.click())
        const confirmation = dialog("Replace your 24 words?")
        expect(confirmation?.textContent).toContain("24 new words replace yours.")
        expect(confirmation?.textContent).toContain(
            "Your history backup is first brought onto this device, then erased and saved again from it under the new words, in the background — keep Pīna'i open until it's done; it carries on at the next start.",
        )
        expect(confirmation?.textContent).toContain(
            "Your devices this one approved with a code get the new words by themselves; the others ask with a code or type the new words.",
        )
        expect(confirmation?.textContent).toContain("A device you revoked can't use the old words any more.")

        await act(async () => button("Cancel", confirmation!)?.click())
        await until(() => dialog("Replace your 24 words?") === null)
        expect(idp.key?.generation).toBe(1)
        expect(laptop.storage.pending).toBeNull()
    })

    it("a password typed too long ago is asked again before anything is minted; back and confirmed again, the new words show over Settings until Continue", async () => {
        const { idp, laptop, rows } = await account()
        wire(laptop, idp, rows)
        useAppStore.setState({ accessToken: accessToken(Date.now() - 30 * 60_000, "laptop", Date.now()) })
        await render()
        await until(() => button("Replace my words") !== undefined)

        await act(async () => button("Replace my words")?.click())
        await act(async () => button("Replace my words", dialog("Replace your 24 words?")!)?.click())
        await until(() => container.textContent?.includes("To replace your words, sign in again") === true)
        expect(dialog("Replace your 24 words?")).toBeNull()
        expect(laptop.storage.pending).toBeNull()
        expect(idp.key?.generation).toBe(1)

        // Back from the IdP's page with the password just typed: pressed and confirmed again.
        useAppStore.setState({ accessToken: laptop.token })
        await act(async () => button("Replace my words")?.click())
        await act(async () => button("Replace my words", dialog("Replace your 24 words?")!)?.click())
        await until(() => dialog("Your new 24 words") !== null)

        expect(idp.key).toMatchObject({ generation: 2, setByDevice: laptop.storage.deviceId })
        const shown = dialog("Your new 24 words")!
        expect(shown.textContent).toContain("Your new passphrase")
        for (const word of laptop.storage.kept!.words) expect(shown.textContent).toContain(word)
        expect(rearchive.run).toHaveBeenCalledOnce()
        expect(laptop.storage.newWords).toBe(2)

        await act(async () => button("Continue", shown)?.click())
        await until(() => dialog("Your new 24 words") === null && laptop.storage.newWords === null)
        await until(() => document.activeElement === button("Replace my words"))
    })

    it("an answer lost on the way leaves “Try again”: pressed again, the words the IdP took show", async () => {
        const { idp, laptop, rows } = await account()
        wire(laptop, idp, rows)
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await FakeHistoryIdp.prototype.setKey.apply(idp, args)
            throw new TypeError("Failed to fetch")
        })
        await render()
        await until(() => button("Replace my words") !== undefined)

        await confirmIt()
        await until(() => dialog("Replace your 24 words?")?.textContent?.includes("your instance didn't answer. Try again.") === true)
        await press("Cancel", dialog("Replace your 24 words?")!)
        await until(() => dialog("Replace your 24 words?") === null)
        expect(button("Replace my words")).toBeDefined()

        await confirmIt()
        await until(() => dialog("Your new 24 words") !== null)
        expect(dialog("Your new 24 words")?.textContent).toContain(laptop.storage.kept!.words[0])
        expect(idp.key?.generation).toBe(2)
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })
    })

    it("says so, and mints nothing, while a restore under the words held is still to apply", async () => {
        const { idp, laptop, rows } = await account()
        laptop.storage.restoreDue = { generation: 1, appliedAt: null }
        wire(laptop, idp, rows)
        await render()
        await until(() => button("Replace my words") !== undefined)

        await confirmIt()
        await until(() => dialog("Replace your 24 words?")?.textContent?.includes("Your history is still being brought to this device.") === true)
        expect(laptop.storage.pending).toBeNull()
        expect(idp.key?.generation).toBe(1)
    })

    it("new words nobody went past — a reload before Continue — show again as the pane opens", async () => {
        const { idp, laptop, rows } = await account()
        await replaceWordsUseCase({ ...laptop.deps, cacheRead: () => true, applyRestored: async () => undefined })({
            idpUrl: IDP,
            accessToken: laptop.token,
            actorUri: ACTOR,
            tokenArrivedAt: Date.now(),
        })
        wire(laptop, idp, rows)
        await render()

        await until(() => dialog("Your new 24 words") !== null)
        expect(dialog("Your new 24 words")?.textContent).toContain(laptop.storage.kept!.words[0])
    })

    it("no “Replace my words” on a device without the current words, nor with a key of its own waiting", async () => {
        const { idp, laptop, rows } = await account()
        const fresh = historyDevice(idp, "fresh", new MemoryHistoryStorage(), issuers.jwks)
        await nameSession(fresh)
        await fresh.e2ee.checkHistoryKey(IDP, fresh.token)
        wire(fresh, idp, rows)
        useAppStore.setState({ accessToken: fresh.token })
        await render()
        await until(() => restoreLink() !== undefined)
        expect(button("Replace my words")).toBeUndefined()
        await act(async () => root?.unmount())
        root = null
        container.remove()

        await laptop.e2ee.mintHistoryKey(2)
        wire(laptop, idp, rows)
        useAppStore.setState({ accessToken: laptop.token })
        await render()
        await until(() => button("Clear history backup") !== undefined)
        expect(button("Replace my words")).toBeUndefined()
    })
})
