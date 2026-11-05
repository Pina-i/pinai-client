/**
 * A reset the user didn't make, and a start over the user did (`identity-provider/specs/e2ee.md
 * § 3.9`, § 6.11), over real E2EE engines and fakes keeping the IdP's rules, on fake timers. The
 * device that starts over takes the devices listed then as seen — none of them arrives — and as from
 * before: its new words name them, Settings → Devices seats them apart with "Sign out", and only a
 * device registering later is announced. A device that held the old words stays in the app under a
 * banner it can't dismiss: "It was me" (the code typed on the device that started over, or its new
 * words) or "It wasn't me" (the password changed first, then a start over from here); after a change
 * none of the user's devices made, "Check again" or a start over. The banner goes once the device
 * holds the key again.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
    Outlet,
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    type AnyRouter,
} from "@tanstack/react-router"
import { StrictMode, act, createElement, useEffect, useMemo, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import type { MlsAdapter } from "@pinai/mls/wasm.adapter"
import type { KeptWordsCause } from "@pinai/domain/models/admission"
import type { UserProfile } from "@pinai/domain/models/auth"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import type { DeviceTrustVerdict } from "@pinai/domain/models/device-trust"
import { devicesToAdd } from "@pinai/domain/models/group"
import { acceptHistoryShareUseCase } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { ApprovalAnswering, ApprovalAsking } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { startOverUseCase } from "@pinai/domain/usecases/e2ee/start-over.usecase"
import { useHistoryShare } from "@/presentation/hooks/use-history-share"
import { HistoryResetContext, type RecheckOutcome } from "@/presentation/providers/HistoryResetProvider/HistoryReset.context"
import { useIdentityOnboardingGate } from "@/presentation/hooks/useIdentityOnboardingGate"
import { useUnapprovedDeviceNotice } from "@/presentation/hooks/use-unapproved-device-notice"
import { HistoryResetBanner } from "@/presentation/organisms/HistoryResetBanner/HistoryResetBanner"
import { DevicesEditor } from "@/presentation/pages/home/SettingsModal/DevicesEditor/DevicesEditor"
import { RecoveryRestorePage } from "@/presentation/pages/onboarding/RecoveryRestorePage/RecoveryRestorePage"
import { useAppStore } from "@/store/store"

import { ACTOR, IDP } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"
import { bundleHpke, sharingAccount, type SharingAccount, type SharingDevice } from "./setup/key-shares"

const wired = vi.hoisted(() => ({
    e2ee: null as unknown,
    relay: null as unknown,
    directory: null as unknown,
    history: null as unknown,
    keyShares: null as unknown,
    session: null as unknown,
    ready: null as (() => void) | null,
}))
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.e2ee,
    getApprovalRelayPort: () => wired.relay,
    getDeviceDirectoryPort: () => wired.directory,
    getHistoryArchivePort: () => wired.history,
    getKeySharePort: () => wired.keyShares,
    getSessionPort: () => wired.session,
    getAuthPort: vi.fn(),
    getAuthPlatform: vi.fn(),
    getSessionRenewal: vi.fn(),
}))
vi.mock("@/presentation/hooks/useIdpWebSocket", () => ({
    registerHistoryKeyReadyHandler: (handler: () => void) => {
        wired.ready = handler
        return () => {
            if (wired.ready === handler) wired.ready = null
        }
    },
}))
vi.mock("sonner", () => ({ toast }))
vi.mock("@/presentation/_libs/history-rearchive", () => ({ rearchiveDueHistory: vi.fn(async () => ({ kind: "idle" })) }))
// React Aria's modal needs more of a browser than jsdom has: what it is asked to say is enough here.
vi.mock("@/presentation/molecules/RecentSignInModal/RecentSignInModal", () => ({
    RecentSignInModal: ({ action }: { action: string | null }) => (action ? `To ${action}, sign in again` : null),
}))

const issuers = new FakeIssuers()
let hpke: MlsAdapter

beforeAll(async () => {
    hpke = await bundleHpke()
})

const mounted: Array<{ root: Root; host: HTMLElement }> = []
let router: AnyRouter

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    // jsdom has no `CSS.escape`, which React Aria's modal reads.
    if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
    toast.mockReset()
    for (const fn of [toast.success, toast.error, toast.message, toast.loading, toast.dismiss]) fn.mockReset()
    useAppStore.setState({ dmMessages: {}, localDmConvos: [] })
})

afterEach(async () => {
    await unmountAll()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

async function unmountAll() {
    for (const { root, host } of mounted.splice(0)) {
        await act(async () => root.unmount())
        host.remove()
    }
}

/** `component` at the root of a router standing at `at`, beside the routes the app goes to. */
async function render(component: () => ReturnType<typeof createElement> | null, at = "/home") {
    const rootRoute = createRootRoute({ component })
    const children = ["/home", "/onboarding/recovery-restore", "/onboarding/history-reset", "/onboarding/recovery-setup"].map((path) =>
        createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
    )
    router = createRouter({ routeTree: rootRoute.addChildren(children), history: createMemoryHistory({ initialEntries: [at] }) })
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    mounted.push({ root, host })
    await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router }))))
}

async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
    })
}

async function until(check: () => boolean, step = 50) {
    for (let i = 0; i < 600 && !check(); i++) await advance(step)
    expect(check()).toBe(true)
}

// Modals render in a portal: the whole document is read.
const text = () => document.body.textContent ?? ""
const button = (label: string, within: ParentNode = document.body) =>
    [...within.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined
const press = (target: HTMLElement | undefined) => act(async () => target?.click())
const tab = (label: string) => [...document.body.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === label)
const dialog = (name: string) => document.body.querySelector<HTMLElement>(`[role="dialog"][aria-label="${name}"]`)
const bar = () => document.body.querySelector<HTMLElement>('section[aria-label="Your history backup"]')
const shownCode = () => (document.body.querySelector('[aria-label^="Approval code"]')?.getAttribute("aria-label") ?? "").replace(/\D/g, "")
const at = () => router.state.location.pathname

const RESET_LINE = "Your history was reset from a device this one doesn't know. Nothing is saved to your backup from here until this is settled."
const UNKNOWN_LINE = "Your instance changed your history key in a way none of your devices made. Nothing is saved to your backup until it puts it back."

function wire(device: SharingDevice, a: SharingAccount) {
    vi.spyOn(device.e2ee, "hasLocalIdentity").mockResolvedValue(false)
    Object.assign(wired, {
        e2ee: device.e2ee,
        relay: a.net.relay,
        directory: a.shares.directory(),
        history: a.idp,
        keyShares: a.shares,
        session: a.idp.session(),
    })
    useAppStore.setState({ idpUrl: IDP, accessToken: device.token, user: { actor_uri: ACTOR, display_name: "Alice" } as UserProfile, wsStatus: "connected" })
}

const row = (a: SharingAccount, device: SharingDevice) => a.net.rows.get(device.storage.deviceId) as DeviceListEntry
const listed = (a: SharingAccount) => [...a.net.rows.values()]

/**
 * The user's account as their test had it: the desktop app holding generation 1, the web app signed
 * in after it and holding nothing — the phone `sharingAccount` makes revoked, out of the way.
 */
async function usersAccount() {
    const a = await sharingAccount(hpke, issuers)
    const desktop = a.laptop
    row(a, desktop).display_name = "Desktop app on Linux"
    row(a, a.phone).revoked_at = "2026-11-04T00:00:00Z"
    const web = await a.enrolled("web", "Firefox on Linux")
    return { a, desktop, web }
}

/** The web app starts over, as its Start over tab does. */
async function startOverOn(device: SharingDevice) {
    const started = await startOverUseCase(device.deps)({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR })
    expect(started).toMatchObject({ kind: "started-over" })
    return started
}

/** The app's shell as `_authenticated` makes it: the gate, its banner over the main area, the share taken in the app. */
function AppShell() {
    const gate = useIdentityOnboardingGate()
    const reset = useMemo(() => ({ reset: gate.reset, recheck: gate.recheck }), [gate.reset, gate.recheck])
    if (gate.status !== "ready") return null
    return createElement(
        HistoryResetContext.Provider,
        { value: reset },
        createElement(Runtime),
        createElement(HistoryResetBanner),
        createElement("main", { id: "app-main", tabIndex: -1 }, createElement(Outlet)),
    )
}

function Runtime() {
    useHistoryShare()
    useUnapprovedDeviceNotice()
    return null
}

/** The device answering the code from its Door, through the same `ApprovalAnswering` the app runs. */
async function answerFrom(device: SharingDevice, a: SharingAccount, code: string, done: () => boolean) {
    const door = new ApprovalAnswering(
        { e2ee: device.e2ee, relay: a.net.relay, directory: a.shares.directory(), sharing: a.sharing(device) },
        a.net.context(device),
    )
    await act(async () => door.refresh())
    await act(async () => door.answer(code))
    for (let i = 0; i < 12 && !done(); i++) {
        await act(async () => door.poll())
        await advance(3_000)
    }
    expect(done()).toBe(true)
}

describe("the user's test: the desktop app holds the words, the web app starts over", () => {
    it("announces no device that was there, names the desktop app from before, keeps it in under a banner, and brings it back with a code", async () => {
        const { a, desktop, web } = await usersAccount()

        // The web app's Start over, on its new-device page: the new words name the desktop app.
        wire(web, a)
        await render(() => createElement(RecoveryRestorePage), "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)
        await press(button("Erase and start over"))
        await until(() => text().includes("Your new 24 words"))
        await until(() => text().includes("Your device from before (Desktop app on Linux) is no longer approved."))
        expect(text()).toContain(`If you still have it, open Pīna'i on it — choose "It was me" if it shows a banner — then type the code it shows here.`)
        expect(text()).toContain("If you've lost it, sign it out in Settings → Devices: a device you've lost still shows your conversations until you sign it out.")
        expect(a.idp.key).toMatchObject({ generation: 2, setByDevice: web.storage.deviceId })
        await press(button("Continue"))
        await unmountAll()

        // The web app in the app: its review announces nobody.
        await render(() => {
            useUnapprovedDeviceNotice()
            return null
        })
        let verdict: DeviceTrustVerdict | null = null
        await act(async () => {
            verdict = await web.e2ee.reviewDevices(IDP, web.token, ACTOR, listed(a))
        })
        expect(verdict).toMatchObject({ acting: true, generation: 2 })
        expect(verdict!.before?.devices.map((d) => [d.deviceId, [...d.rootKey]])).toEqual([[desktop.storage.deviceId, [...desktop.storage.rootKey.publicKey]]])
        expect(web.e2ee.trustSnapshot()).toContainEqual(expect.objectContaining({ kind: "unapproved-device", deviceId: desktop.storage.deviceId, arrived: false }))
        expect(toast).not.toHaveBeenCalled()
        await unmountAll()

        // Its Settings → Devices: the desktop app from before, with "Sign out" — waiting for nobody.
        await render(() => createElement(DevicesEditor))
        await until(() => text().includes("From before you started over"))
        const seat = document.body.querySelector<HTMLElement>(`[data-seat="${desktop.storage.deviceId}"]`)
        expect(seat?.textContent).toContain("Desktop app on Linux")
        expect(seat?.textContent).toContain(`Still have it? Open Pīna'i on it — choose "It was me" if it shows a banner — then type the code it shows here.`)
        expect(seat?.textContent).toContain("A device you've lost still shows your conversations until you sign it out.")
        expect(seat?.textContent).not.toContain("waiting for you")
        expect(button("Sign out", seat!)?.getAttribute("aria-label")).toBe("Sign out Desktop app on Linux")
        expect(button("Not mine")).toBeUndefined()
        expect(text()).not.toMatch(/\d waiting/)
        await unmountAll()

        // The desktop app: in the app, under the banner — not on the reset page.
        wire(desktop, a)
        await render(AppShell)
        await until(() => bar() !== null)
        expect(at()).toBe("/home")
        expect(bar()?.textContent).toContain(RESET_LINE)
        expect(desktop.storage.admission).toEqual({ kind: "in", by: "kept-words", cause: "reset-by-unapproved" })
        // The bar was there from the first paint: nothing to announce.
        expect(document.body.querySelector("p.sr-only[role=status]")?.textContent).toBe("")

        // "It was me": the code, typed on the web app.
        await press(button("It was me"))
        await until(() => dialog("Let this device back in") !== null && shownCode().length === 6)
        expect(dialog("Let this device back in")?.textContent).toContain("Open Pīna'i on the device that reset your history and type it when it asks.")
        await answerFrom(web, a, shownCode(), () => text().includes("This device is approved."))

        // The web app shares once approved back; the IdP tells the desktop app.
        await act(async () => void (await a.refresh(web)))
        await act(async () => wired.ready?.())
        await until(() => dialog("Let this device back in") === null)
        expect(await desktop.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 2, settled: true })
        await until(() => bar() === null)
        expect(at()).toBe("/home")
        // The bar's buttons went with it: the focus goes to the main area, not the page's body.
        await until(() => document.activeElement?.id === "app-main")
    })

    it("keeps the desktop app under its banner from acting: it uploads nothing, adds nobody, answers no request, announces nothing", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        const tablet = await a.enrolled("tablet", "Safari on iPadOS")
        wire(desktop, a)
        await render(AppShell)
        await until(() => bar() !== null)
        const uploads = a.idp.uploads.length

        await act(async () => a.archive(desktop, ["not saved"]))
        let verdict: DeviceTrustVerdict | null = null
        await act(async () => {
            verdict = await desktop.e2ee.reviewDevices(IDP, desktop.token, ACTOR, listed(a))
        })
        const asker = new ApprovalAsking({ e2ee: tablet.e2ee, relay: a.net.relay, directory: a.shares.directory() }, a.net.context(tablet))
        await act(async () => asker.tick())
        const door = new ApprovalAnswering({ e2ee: desktop.e2ee, relay: a.net.relay, directory: a.shares.directory() }, a.net.context(desktop))
        await act(async () => door.refresh())

        expect(a.idp.uploads).toHaveLength(uploads)
        expect(verdict).toMatchObject({ acting: false })
        expect(devicesToAdd([], ACTOR, verdict!)).toEqual([])
        expect(asker.state.kind).toBe("showing")
        expect(door.snapshot()).toBeNull()
        expect(desktop.e2ee.trustSnapshot().some((e) => e.kind === "unapproved-device")).toBe(false)
        expect(toast).not.toHaveBeenCalled()
    })

    it("takes the devices listed as its baseline as the desktop app accepts the share: none announced once it holds generation 2", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        const tablet = await a.enrolled("tablet", "Safari on iPadOS")
        await a.handshake(desktop, web)
        await a.refresh(web)
        wire(desktop, a)
        await render(() => {
            useUnapprovedDeviceNotice()
            return null
        })

        expect(await acceptHistoryShareUseCase(desktop.deps)(IDP, desktop.token, ACTOR)).toEqual({ kind: "kept", generation: 2 })
        await act(async () => void (await desktop.e2ee.reviewDevices(IDP, desktop.token, ACTOR, listed(a))))

        expect(desktop.e2ee.trustSnapshot()).toContainEqual(expect.objectContaining({ kind: "unapproved-device", deviceId: tablet.storage.deviceId, arrived: false }))
        expect(toast).not.toHaveBeenCalled()
    })

    it("offers no “Restore history” under the banner: the way back is its “It was me”", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        wire(desktop, a)
        await act(async () => void (await desktop.e2ee.checkHistoryKey(IDP, desktop.token)))
        const recheck = async () => "checked" as const
        const restoreLink = () => [...document.body.querySelectorAll("a")].find((link) => link.textContent?.includes("Restore history"))

        await render(() => createElement(HistoryResetContext.Provider, { value: { reset: null, recheck } }, createElement(DevicesEditor)))
        await until(() => restoreLink() !== undefined)
        await unmountAll()

        const reset = { cause: "reset-by-unapproved" as const, setter: web.storage.deviceId }
        await render(() => createElement(HistoryResetContext.Provider, { value: { reset, recheck } }, createElement(DevicesEditor)))
        await until(() => text().includes("Devices"))
        await advance(500)
        expect(restoreLink()).toBeUndefined()
    })

    it("announces a device registering after the start over", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        wire(web, a)
        await render(() => {
            useUnapprovedDeviceNotice()
            return null
        })
        await act(async () => void (await web.e2ee.reviewDevices(IDP, web.token, ACTOR, listed(a))))
        expect(toast).not.toHaveBeenCalled()

        const tablet = a.device("tablet")
        a.net.enrol(tablet, "Safari on iPadOS")
        await act(async () => void (await web.e2ee.reviewDevices(IDP, web.token, ACTOR, listed(a))))

        expect(toast).toHaveBeenCalledTimes(1)
        expect(toast.mock.calls[0][0]).toBe("New device not approved: Safari on iPadOS. Not you? Sign it out.")
        expect(desktop.storage.deviceId).not.toBe(tablet.storage.deviceId)
    })
})

describe("the banner", () => {
    async function shown(cause: KeptWordsCause | null, outcome: RecheckOutcome = "checked") {
        const recheck = vi.fn(async () => outcome)
        const reset = cause && { cause, setter: null }
        await render(() => createElement(HistoryResetContext.Provider, { value: { reset, recheck } }, createElement(HistoryResetBanner)))
        return recheck
    }

    it("after a reset by a device this one doesn't know: what happened, “It was me”, “It wasn't me”", async () => {
        await shown("reset-by-unapproved")
        expect(bar()?.textContent).toContain(RESET_LINE)
        expect(button("It was me")).toBeDefined()
        expect(button("It wasn't me")).toBeDefined()
        expect(button("Check again")).toBeUndefined()
        // Nothing dismisses it.
        expect(bar()?.querySelectorAll("button")).toHaveLength(2)
    })

    it("after a change none of the user's devices made: what happened, “Check again”, a start over", async () => {
        const recheck = await shown("unknown-change")
        expect(bar()?.textContent).toContain(UNKNOWN_LINE)
        expect(button("It was me")).toBeUndefined()
        expect(button("Start over from here")).toBeDefined()

        await press(button("Check again"))
        expect(recheck).toHaveBeenCalledOnce()
        await until(() => bar()?.textContent?.includes("Nothing has changed yet: your instance hasn't put your history key back.") === true)
    })

    it("says when “Check again” couldn't reach the instance, rather than that nothing changed", async () => {
        await shown("unknown-change", "offline")
        await press(button("Check again"))
        await until(() => bar()?.textContent?.includes("Couldn't reach your instance. Try again in a moment.") === true)
        expect(bar()?.textContent).not.toContain("Nothing has changed yet")
    })

    it("tells a screen reader of a cause that comes after the page did, once", async () => {
        const handle: { set: (cause: KeptWordsCause | null) => void } = { set: () => undefined }
        function Live() {
            const [cause, setCause] = useState<KeptWordsCause | null>(null)
            useEffect(() => {
                handle.set = setCause
            }, [])
            const value = useMemo(() => ({ reset: cause && { cause, setter: null }, recheck: async () => "checked" as const }), [cause])
            return createElement(HistoryResetContext.Provider, { value }, createElement(HistoryResetBanner))
        }
        await render(Live)
        const live = () => document.body.querySelector("p.sr-only[role=status]")?.textContent
        expect(live()).toBe("")

        await act(async () => handle.set("reset-by-unapproved"))
        expect(live()).toBe(RESET_LINE)
        await act(async () => handle.set(null))
        expect(live()).toBe("")
    })

    it("shows nothing for a device holding the key", async () => {
        await shown(null)
        expect(bar()).toBeNull()
        expect(text()).toBe("")
    })

    it("renders one bar and one request under StrictMode", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        wire(desktop, a)
        await render(() => createElement(StrictMode, null, createElement(AppShell)))
        await until(() => bar() !== null)
        expect(document.body.querySelectorAll('section[aria-label="Your history backup"]')).toHaveLength(1)

        await press(button("It was me"))
        await until(() => shownCode().length === 6)
        await advance(1_000)
        expect([...a.net.requests.keys()].filter((id) => a.net.isOpen(id))).toHaveLength(1)
    })

    it("comes back on the start over after the password was asked again, the parameter dropped — and on nothing without a cause", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        wire(desktop, a)
        await render(AppShell, "/home?reset=start-over")
        await until(() => dialog("It wasn't me") !== null)
        await until(() => !router.state.location.searchStr.includes("reset"))
        await unmountAll()

        const held = await usersAccount()
        wire(held.desktop, held.a)
        await render(AppShell, "/home?reset=start-over")
        await until(() => !router.state.location.searchStr.includes("reset"))
        await advance(500)
        expect(document.body.querySelector('[role="dialog"]')).toBeNull()
        expect(bar()).toBeNull()
    })

    it("can't be dismissed while the code's exchange works, and opens again with no words typed", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        wire(desktop, a)
        await render(AppShell)
        await until(() => bar() !== null)

        await press(button("It was me"))
        await until(() => tab("Its 24 words") !== undefined)
        await press(tab("Its 24 words"))
        const inputs = () => [...(dialog("Let this device back in")?.querySelectorAll("input") ?? [])]
        await until(() => inputs().length === 24)
        await act(async () => {
            const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
            event.clipboardData = { getData: () => web.storage.kept!.words.join(" ") }
            inputs()[0].dispatchEvent(event)
        })
        await until(() => inputs()[0].value !== "")
        await press(button("Not now"))
        await until(() => dialog("Let this device back in") === null)
        await press(button("It was me"))
        await until(() => tab("Its 24 words") !== undefined)
        await press(tab("Its 24 words"))
        await until(() => inputs().length === 24)
        expect(inputs().every((input) => input.value === "")).toBe(true)

        await press(tab("That device"))
        await until(() => shownCode().length === 6)
        const door = new ApprovalAnswering({ e2ee: web.e2ee, relay: a.net.relay, directory: a.shares.directory() }, a.net.context(web))
        await act(async () => door.refresh())
        await act(async () => door.answer(shownCode()))
        await until(() => button("Not now")?.disabled === true)
        expect(dialog("Let this device back in")).not.toBeNull()
    })

    it("goes once the device holds the key again: the new words typed under “It was me”", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        wire(desktop, a)
        await render(AppShell)
        await until(() => bar() !== null)

        await press(button("It was me"))
        await until(() => tab("Its 24 words") !== undefined)
        await press(tab("Its 24 words"))
        const inputs = () => dialog("Let this device back in")!.querySelectorAll("input")
        await until(() => inputs().length === 24)
        await act(async () => {
            const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
            event.clipboardData = { getData: () => web.storage.kept!.words.join(" ") }
            inputs()[0].dispatchEvent(event)
        })
        await until(() => button("Bring my history →")?.disabled === false)
        await press(button("Bring my history →"))

        await until(() => bar() === null && dialog("Let this device back in") === null)
        expect(await desktop.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(at()).toBe("/home")
    })

    it("“It wasn't me”: the password changed first, then a start over here — this device the reference, the one refused never one of its own", async () => {
        const { a, desktop, web } = await usersAccount()
        await startOverOn(web)
        wire(desktop, a)
        await render(AppShell)
        await until(() => bar() !== null)
        // As the app's own review does: the reset stands, and its withdrawal comes mid-flow.
        await act(async () => void (await desktop.e2ee.reviewDevices(IDP, desktop.token, ACTOR, listed(a))))
        expect(desktop.e2ee.trustSnapshot()).toContainEqual(expect.objectContaining({ kind: "reset-by-unapproved", generation: 2 }))

        await press(button("It wasn't me"))
        await until(() => dialog("It wasn't me") !== null)
        const modal = dialog("It wasn't me")!
        expect(modal.textContent).toContain("Change your password")
        expect(modal.textContent).toContain("Someone else has it. Change it with a reset link")
        expect(modal.textContent).toContain(`That signs every session out, theirs and this one: once you've signed in again, choose "It wasn't me" on this banner once more.`)
        expect(modal.textContent).toContain("The device that reset your history isn't yours: it won't be approved.")
        expect(modal.textContent).not.toContain("Then the device")

        await until(() => button("Erase and start over", modal)?.disabled === false)
        await press(button("Erase and start over", modal))
        await until(() => dialog("Your new 24 words") !== null)
        await advance(1_000)

        expect(a.idp.key).toMatchObject({ generation: 3, setByDevice: desktop.storage.deviceId })
        expect(await desktop.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 3, settled: true })
        // The device that reset the history is no device of the user's from before.
        expect(text()).not.toContain("from before")
        expect(desktop.storage.trust.before.map((b) => [b.devices, b.refused.map((d) => d.deviceId)])).toEqual([[[], [web.storage.deviceId]]])
        // The banner goes; the new words stay until the user goes past them, in the app.
        await until(() => bar() === null)
        expect(dialog("Your new 24 words")).not.toBeNull()
        expect(at()).toBe("/home")
        await press(button("Continue"))
        await until(() => dialog("Your new 24 words") === null)
        expect(at()).toBe("/home")
        await unmountAll()

        // Its Settings → Devices: the device refused waits, "not yours", no code — even when it asks; the Door offers none either.
        const asker = new ApprovalAsking({ e2ee: web.e2ee, relay: a.net.relay, directory: a.shares.directory() }, a.net.context(web))
        await act(async () => asker.tick())
        expect(asker.state.kind).toBe("showing")
        const door = new ApprovalAnswering({ e2ee: desktop.e2ee, relay: a.net.relay, directory: a.shares.directory() }, a.net.context(desktop))
        await act(async () => door.refresh())
        expect(door.snapshot()).toBeNull()
        expect(door.seats().open).toEqual([])

        await render(() => createElement(DevicesEditor))
        await until(() => document.body.querySelector(`[data-seat="${web.storage.deviceId}"]`) !== null)
        const seat = document.body.querySelector<HTMLElement>(`[data-seat="${web.storage.deviceId}"]`)!
        expect(seat.textContent).toContain("Reset your history — not yours")
        expect(button("Sign out", seat)?.getAttribute("aria-label")).toBe("Sign out Firefox on Linux")
        expect(seat.querySelector("input")).toBeNull()
        expect(seat.textContent).not.toContain("Still have it?")
        expect(text()).toContain("1 waiting")
        expect(text()).not.toContain("From before")
    })

    it("after a change none of the user's devices made, starts over from here", async () => {
        const { a, desktop } = await usersAccount()
        a.idp.key = { ...a.idp.key!, approvalPublicKey: ed25519.keygen().publicKey }
        wire(desktop, a)
        await render(AppShell)
        await until(() => bar()?.textContent?.includes(UNKNOWN_LINE) === true)

        await press(button("Start over from here"))
        await until(() => dialog("Start over from here") !== null)
        const modal = dialog("Start over from here")!
        expect(modal.textContent).not.toContain("Someone else has your password")
        expect(modal.textContent).toContain("becomes your reference, whatever your instance changed")
        await until(() => button("Erase and start over", modal)?.disabled === false)
        await press(button("Erase and start over", modal))

        await until(() => dialog("Your new 24 words") !== null && bar() === null)
        expect(a.idp.key).toMatchObject({ generation: 2, setByDevice: desktop.storage.deviceId })
        // Its words kept withdrew the warning while its pending key waited: the gate didn't send it to setup.
        expect(at()).toBe("/home")
    })
})
