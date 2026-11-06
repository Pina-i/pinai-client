/**
 * The onboarding gate, the KeyPackage tick it enables, and the pages it keeps a device on, rendered
 * in a memory router over real E2EE engines, on fake timers (`identity-provider/specs/e2ee.md § 3.6`;
 * the design's § 5.2 and § 5.4).
 *
 * The gate checks as it mounts, then in the background: at a route change, at most once in 30 s and
 * never while a check runs, and at once when the device hears its key changed. The newest check
 * decides; one that fails, or one finishing after an unmount or a sign-out, changes nothing. A device
 * let in isn't stopped where it stands; one in by its kept words gets the banner's cause. The new-device page, drawn as Pass, has three tabs — another
 * device's code, the 24 words, a start over — and signing out; a device already in gets no start
 * over, and "Back". Starting over asks a password typed too long ago again before anything is
 * minted, and shows the new words only once the IdP took them — again after a reload, until the user
 * goes past them. The reset page offers that device, its 24 words and a start over from here after
 * a device this device found approved replaced the words, naming it; a device holding words of the
 * account over any other reset goes on to the app at its check. For a device that never held words,
 * a change no start over explains offers "Check again", a start over from here and signing out —
 * and for a key gone back, only "Check again" and signing out.
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
import { act, createElement, type FunctionComponent } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import type { UserProfile } from "@pinai/domain/models/auth"
import type { HistoryKeyStanding } from "@pinai/domain/models/history-key"
import { IdpError } from "@pinai/domain/models/idp-error"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { useIdentityOnboardingGate, type GateResult } from "@/presentation/hooks/useIdentityOnboardingGate"
import { useReplenishKeyPackages } from "@/presentation/hooks/use-replenish-key-packages"
import { RecoveryRestorePage } from "@/presentation/pages/onboarding/RecoveryRestorePage/RecoveryRestorePage"
import { RecoverySetupPage } from "@/presentation/pages/onboarding/RecoverySetupPage/RecoverySetupPage"
import { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { startOverUseCase } from "@pinai/domain/usecases/e2ee/start-over.usecase"
import { useAppStore } from "@/store/store"
import { momentLabel } from "@/presentation/_libs/day-label"
import { toast } from "sonner"

import { accessToken } from "./setup/access-token"
import { FakeAccount } from "./setup/approval-relay"
import { ACTOR, FakeHistoryIdp, IDP, MemoryHistoryStorage, historyDevice, nameSession } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"

const wired = vi.hoisted(() => ({
    e2ee: null as unknown,
    session: null as unknown,
    history: null as unknown,
    directory: null as unknown,
    relay: null as unknown,
    platform: null as unknown,
    startOver: null as unknown,
    keyShares: { share: async () => undefined, waiting: async () => null } as unknown,
    lowHandler: null as (() => void) | null,
}))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.e2ee,
    getSessionPort: () => wired.session,
    getHistoryArchivePort: () => wired.history,
    getDeviceDirectoryPort: () => wired.directory,
    getApprovalRelayPort: () => wired.relay,
    getKeySharePort: () => wired.keyShares,
    getStartOverPort: () => wired.startOver,
    getAuthPlatform: () => wired.platform,
    getAuthPort: vi.fn(),
    getSessionRenewal: vi.fn(),
}))
vi.mock("@/presentation/hooks/useIdpWebSocket", () => ({
    registerKeyPackagesLowHandler: (handler: () => void) => {
        wired.lowHandler = handler
        return () => {
            if (wired.lowHandler === handler) wired.lowHandler = null
        }
    },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
const login = vi.hoisted(() => ({ start: vi.fn(async () => undefined) }))
vi.mock("@pinai/domain/usecases/auth/startLogin.usecase", () => ({ startLoginUseCase: login.start }))

const issuers = new FakeIssuers()
type Device = ReturnType<typeof historyDevice>

/** An account whose laptop holds generation 1, and a phone that holds nothing, both on the relay's list. */
async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop", new MemoryHistoryStorage(), issuers.jwks)
    await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    const phone = historyDevice(idp, "phone", new MemoryHistoryStorage(), issuers.jwks)
    const net = new FakeAccount(issuers)
    net.enrol(laptop, "Firefox on Linux")
    net.enrol(phone, "Chrome on Android")
    return { idp, laptop, phone, net }
}

async function startOverElsewhere(idp: FakeHistoryIdp) {
    const other = historyDevice(idp, "elsewhere")
    await nameSession(other)
    await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey(2)).key)
}

/** `device` sets generation 2 — its words replaced, or a start over: the IdP records it as the setter. */
async function newWordsOn(device: Device, idp: FakeHistoryIdp) {
    await nameSession(device)
    await idp.setKey(IDP, device.token, (await device.e2ee.mintHistoryKey(2)).key)
}

const platform = () => ({ browserSession: false, tokens: { clear: vi.fn() }, navigation: { navigateTo: vi.fn() } })

function signIn(device: Device, idp: FakeHistoryIdp, net: FakeAccount) {
    vi.spyOn(device.e2ee, "hasLocalIdentity").mockResolvedValue(false)
    Object.assign(wired, {
        e2ee: device.e2ee,
        session: idp.session(),
        history: idp,
        directory: net.directory,
        relay: net.relay,
        platform: platform(),
        startOver: idp.startOverRoutes(),
    })
    useAppStore.setState({ idpUrl: IDP, accessToken: device.token, user: { actor_uri: ACTOR, display_name: "Alice" } as UserProfile })
}

let root: Root | null = null
let container: HTMLElement
let router: AnyRouter

const PATHS = ["/home", "/dm/$name", "/onboarding/recovery-setup", "/onboarding/recovery-restore", "/onboarding/history-reset"]

async function render(layout: FunctionComponent, at = "/home"): Promise<void> {
    const rootRoute = createRootRoute({ component: layout })
    const children = PATHS.map((path) => createRoute({ getParentRoute: () => rootRoute, path, component: () => null }))
    router = createRouter({ routeTree: rootRoute.addChildren(children), history: createMemoryHistory({ initialEntries: [at] }) })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root?.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router })))
    })
}

async function unmount() {
    if (!root) return
    const leaving = root
    root = null
    await act(async () => leaving.unmount())
    container.remove()
}

async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
    })
}

async function until(check: () => boolean, step = 20) {
    for (let i = 0; i < 300 && !check(); i++) await advance(step)
    expect(check()).toBe(true)
}

const at = () => router.state.location.pathname
const go = (name: string) =>
    act(async () => {
        await router.navigate({ to: "/dm/$name", params: { name } })
    })

/** A promise the test settles. */
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
    return { promise, resolve, reject }
}

const HOLDS: HistoryKeyStanding = { kind: "holds", generation: 1, settled: true }
const CHANGED: HistoryKeyStanding = { kind: "mismatch", generation: 1, setByDevice: null, reason: "approval-key", held: 1 }

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(async () => {
    await unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("the onboarding gate", () => {
    let gate!: GateResult

    function Layout() {
        gate = useIdentityOnboardingGate()
        return createElement(Outlet)
    }

    /** The laptop let in, and its key checks from then on under the test's hand. */
    async function inThenWatched() {
        const accounts = await account()
        const { idp, laptop, net } = accounts
        signIn(laptop, idp, net)
        await render(Layout)
        await until(() => gate.status === "ready")
        const checks = vi.spyOn(laptop.e2ee, "checkHistoryKey")
        return { ...accounts, checks }
    }

    it("lets in the device holding the key, and keeps a new device on the new-device page", async () => {
        const { idp, laptop, phone, net } = await account()
        signIn(laptop, idp, net)
        await render(Layout)
        await until(() => gate.status === "ready")
        expect(at()).toBe("/home")
        await unmount()

        signIn(phone, idp, net)
        await render(Layout)
        await until(() => at() === "/onboarding/recovery-restore")
        expect(gate.status).toBe("redirecting")
    })

    it("keeps a device in where it stands when a device it never approved starts over: its banner comes at the next check", async () => {
        const { idp, checks } = await inThenWatched()
        await startOverElsewhere(idp)

        await advance(31_000)
        expect(checks).not.toHaveBeenCalled()
        expect(gate.reset).toBeNull()

        await go("kai@idp.test")
        await until(() => gate.reset?.cause === "reset-by-unapproved")
        expect(gate.reset?.setter).toBe(idp.key?.setByDevice)
        expect(checks).toHaveBeenCalledOnce()
        expect(at()).toBe("/dm/kai%40idp.test")
        expect(gate.status).toBe("ready")
    })

    it("sends a device to the reset page at the next route once a device it found approved replaced its words", async () => {
        const { idp, laptop, phone, checks } = await inThenWatched()
        laptop.storage.trust = { ...laptop.storage.trust, approved: [{ deviceId: phone.storage.deviceId, rootKey: phone.storage.rootKey.publicKey }] }
        await newWordsOn(phone, idp)

        await advance(31_000)
        await go("kai@idp.test")
        await until(() => at() === "/onboarding/history-reset")
        expect(checks).toHaveBeenCalledOnce()
        expect(gate.status).toBe("redirecting")
    })

    it("checks at a route change at most once in 30 s, and never while a check runs", async () => {
        const { checks } = await inThenWatched()
        const held = deferred<HistoryKeyStanding>()

        await go("a@idp.test")
        expect(checks).not.toHaveBeenCalled()

        await advance(30_000)
        checks.mockReturnValueOnce(held.promise)
        await go("b@idp.test")
        expect(checks).toHaveBeenCalledTimes(1)

        await advance(31_000)
        await go("c@idp.test")
        expect(checks).toHaveBeenCalledTimes(1)

        await act(async () => held.resolve(HOLDS))
        await advance(31_000)
        await go("d@idp.test")
        expect(checks).toHaveBeenCalledTimes(2)
        expect(gate.status).toBe("ready")
    })

    it("checks at once when the device hears its key changed, and once more when it stops hearing it: the reason comes and goes, the device in", async () => {
        const { idp, laptop, checks } = await inThenWatched()
        const held = idp.key!
        idp.key = { ...held, approvalPublicKey: ed25519.keygen().publicKey }

        // As an upload's stale_history_key would: the key read again, the change heard.
        await act(async () => {
            await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        })

        await until(() => gate.reset?.cause === "unknown-change")
        // The test's own read, then the gate's one check on hearing it.
        expect(checks).toHaveBeenCalledTimes(2)
        expect(at()).toBe("/home")

        idp.key = held
        await act(async () => {
            await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        })
        await until(() => gate.reset === null)
        await advance(1_000)
        // The test's second read, then the gate's one check on the warning withdrawn, and no other.
        expect(checks).toHaveBeenCalledTimes(4)
        expect(gate.status).toBe("ready")
    })

    it("lets the newest of two overlapping checks decide", async () => {
        const { laptop, checks } = await inThenWatched()
        const older = deferred<HistoryKeyStanding>()
        const newer = deferred<HistoryKeyStanding>()
        checks.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)

        await act(async () => laptop.e2ee["stand"]({ kind: "reset-by-unapproved", generation: 2, setByDevice: null }))
        await act(async () => laptop.e2ee["stand"]({ kind: "key-replaced", generation: 1 }))
        expect(checks).toHaveBeenCalledTimes(2)

        await act(async () => newer.resolve(HOLDS))
        await act(async () => older.resolve(CHANGED))
        await advance(100)
        expect(at()).toBe("/home")
        expect(gate.status).toBe("ready")
    })

    it("keeps the device in when a check fails", async () => {
        const { checks } = await inThenWatched()
        checks.mockRejectedValueOnce(new IdpError(401, "invalid_token", "Sign in again"))

        await advance(31_000)
        await go("kai@idp.test")
        await advance(100)

        expect(checks).toHaveBeenCalledOnce()
        expect(at()).toBe("/dm/kai%40idp.test")
        expect(gate.status).toBe("ready")
    })

    it("acts on no check that finishes after an unmount", async () => {
        const { checks } = await inThenWatched()
        const held = deferred<HistoryKeyStanding>()
        checks.mockReturnValueOnce(held.promise)
        await advance(31_000)
        await go("kai@idp.test")

        await unmount()
        await act(async () => held.resolve(CHANGED))
        await advance(100)

        expect(at()).toBe("/dm/kai%40idp.test")
    })

    it("acts on no check that finishes after a sign-out", async () => {
        const { checks } = await inThenWatched()
        const held = deferred<HistoryKeyStanding>()
        checks.mockReturnValueOnce(held.promise)
        await advance(31_000)
        await go("kai@idp.test")

        await act(async () => useAppStore.setState({ accessToken: null }))
        await act(async () => held.resolve(CHANGED))
        await advance(100)

        expect(at()).toBe("/dm/kai%40idp.test")
        expect(gate.status).toBe("loading")
    })
})

describe("the KeyPackage tick", () => {
    function Tick({ ready }: { ready: boolean }) {
        useReplenishKeyPackages(ready)
        return null
    }

    const show = (ready: boolean) =>
        act(async () => {
            root?.render(createElement(Tick, { ready }))
        })

    it("runs only while the gate lets the device in, and stops with it", async () => {
        const { idp, laptop, net } = await account()
        signIn(laptop, idp, net)
        const refill = vi.spyOn(laptop.e2ee, "replenishKeyPackages").mockResolvedValue({ devices: [], refill_threshold: 20, cap: 100 })
        container = document.createElement("div")
        root = createRoot(container)
        await show(false)
        await advance(100)
        expect(refill).not.toHaveBeenCalled()
        expect(wired.lowHandler).toBeNull()

        await show(true)
        await until(() => refill.mock.calls.length === 1)
        expect(wired.lowHandler).not.toBeNull()

        await show(false)
        await advance(7 * 60 * 60_000)
        expect(refill).toHaveBeenCalledOnce()
        expect(wired.lowHandler).toBeNull()
    })
})

const text = () => container.textContent ?? ""
const button = (label: string, within: ParentNode = container) =>
    [...within.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined
const tabs = () => [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
const tab = (label: string) => [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === label)
const openTab = () => container.querySelector('[role="tab"][aria-selected="true"]')?.textContent
const shownCode = () => (container.querySelector('[aria-label^="Approval code"]')?.getAttribute("aria-label") ?? "").replace(/\D/g, "")
const press = (target: HTMLElement | undefined) => act(async () => target?.click())

/** The phone signed in with a token whose password was typed `ago` ms before now. */
function signedInAgo(device: Device, idp: FakeHistoryIdp, net: FakeAccount, ago = 0) {
    device.token = accessToken(Date.now() - ago)
    net.alsoSignedIn(device.token, device)
    signIn(device, idp, net)
}

describe("the new-device page, drawn as Pass", () => {
    const page = () => createElement(RecoveryRestorePage)

    it("names the instance, and opens on “Another device”, beside “My 24 words” and “Start over”; signing out stays", async () => {
        const { idp, phone, net } = await account()
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => shownCode().length === 6)

        expect(text()).toContain("— idp.test")
        expect(text()).toContain("First connection to a new device")
        expect(tabs()).toEqual(["Another device", "My 24 words", "Start over"])
        expect(openTab()).toBe("Another device")
        expect(text()).toContain("Open Pīna'i on one of your devices and type it when it asks.")
        expect(text()).toContain("Letting in")
        expect(text()).toContain("Approve from")
        expect(text()).toContain("Firefox on Linux")
        expect(text()).toContain("your conversations and history arrive here")
        expect(text()).not.toMatch(/start fresh/i)
        expect(button("Sign out")).toBeDefined()
        expect(button("Back to Pīna'i")).toBeUndefined()
    })

    it("leaving “Another device” ends its request; coming back opens one at once", async () => {
        const { idp, phone, net } = await account()
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => shownCode().length === 6)
        const first = net.last()

        await press(tab("My 24 words"))
        await until(() => !net.isOpen(first))
        expect(openTab()).toBe("My 24 words")
        await advance(60_000)
        expect(net.requests.size).toBe(1)

        await press(tab("Another device"))
        await until(() => net.requests.size === 2 && shownCode().length === 6)
        expect(net.isOpen(net.last())).toBe(true)
    })

    it("switching tabs quickly ends on one request, open while its tab is", async () => {
        const { idp, phone, net } = await account()
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=words")
        await until(() => button("Sign out") !== undefined && openTab() === "My 24 words")

        await act(async () => {
            tab("Another device")?.click()
            tab("My 24 words")?.click()
            tab("Another device")?.click()
        })
        await until(() => shownCode().length === 6)
        expect(openTab()).toBe("Another device")
        expect([...net.requests.keys()].filter((id) => net.isOpen(id))).toEqual([net.last()])
    })

    it("leaving “Another device” once another device answered its code doesn't end the exchange: the approval goes on", async () => {
        const { idp, laptop, phone, net } = await account()
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => shownCode().length === 6)
        const door = new ApprovalAnswering({ e2ee: laptop.e2ee, relay: net.relay, directory: net.directory }, net.context(laptop))
        await act(async () => door.refresh())
        await act(async () => door.answer(shownCode()))
        await advance(3_000)

        await press(tab("My 24 words"))
        await advance(100)
        expect(net.isOpen(net.last())).toBe(true)

        for (let i = 0; i < 10 && !text().includes("This device is approved."); i++) {
            await act(async () => door.poll())
            await advance(3_000)
        }
        expect(text()).toContain("This device is approved.")
    })

    it("“My 24 words”: 24 fields, all pasted at once, “Bring my history →” — wrong words refused, the right ones let it in", async () => {
        const { idp, laptop, phone, net } = await account()
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=words")
        await until(() => button("Sign out") !== undefined && openTab() === "My 24 words")

        const inputs = () => container.querySelectorAll("input")
        expect(inputs().length).toBe(24)
        expect(text()).toContain("Pasting all of them at once works.")
        expect(button("Bring my history →")?.disabled).toBe(true)

        const paste = (words: string[]) =>
            act(async () => {
                const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
                event.clipboardData = { getData: () => words.join(" ") }
                inputs()[0].dispatchEvent(event)
            })
        const wrong = [...laptop.storage.kept!.words].reverse()
        await paste(wrong)
        await until(() => button("Bring my history →")?.disabled === false)
        await press(button("Bring my history →"))
        await until(() => vi.mocked(toast.error).mock.calls.length === 1)
        expect(toast.error).toHaveBeenCalledWith("Wrong passphrase — these aren't your account's 24 words")
        expect(phone.storage.kept).toBeNull()

        await paste(laptop.storage.kept!.words)
        await press(button("Bring my history →"))
        await until(() => at() === "/home")
        expect(phone.storage.kept?.words).toEqual(laptop.storage.kept!.words)
    })

    it("signs out with “Sign out”", async () => {
        const { idp, phone, net } = await account()
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=words")
        await until(() => button("Sign out") !== undefined)

        await press(button("Sign out"))

        const { navigation, tokens } = wired.platform as ReturnType<typeof platform>
        expect(navigation.navigateTo).toHaveBeenCalledWith("/")
        expect(tokens.clear).toHaveBeenCalled()
        expect(useAppStore.getState().accessToken).toBeNull()
    })

    it("to a device already in, which came to bring its history: no start over, and “Back”", async () => {
        const { idp, laptop, net } = await account()
        signIn(laptop, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Back to Pīna'i") !== undefined)

        expect(text()).toContain("Bring your history to this device")
        expect(tabs()).toEqual(["Another device", "My 24 words"])
        expect(openTab()).toBe("Another device")
        expect(button("Erase and start over")).toBeUndefined()

        await press(button("Back to Pīna'i"))
        await until(() => at() === "/home")
    })

    it("after a reload, new words a start over set and nobody went past are shown again", async () => {
        const { idp, phone, net } = await account()
        phone.token = accessToken(Date.now(), "phone")
        net.alsoSignedIn(phone.token, phone)
        await startOverUseCase(phone.deps)({ idpUrl: IDP, accessToken: phone.token, actorUri: ACTOR, tokenArrivedAt: Date.now() })
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => text().includes("Your new 24 words"))
        for (const word of phone.storage.kept!.words) expect(text()).toContain(word)
        expect(document.activeElement?.textContent).toBe("Your new 24 words")

        await press(button("Continue"))
        await until(() => at() === "/home")
        expect(phone.storage.newWords).toBeNull()
    })

    it("the setup page shows them as such too", async () => {
        const { idp, phone, net } = await account()
        phone.token = accessToken(Date.now(), "phone")
        net.alsoSignedIn(phone.token, phone)
        await startOverUseCase(phone.deps)({ idpUrl: IDP, accessToken: phone.token, actorUri: ACTOR, tokenArrivedAt: Date.now() })
        signIn(phone, idp, net)
        await render(() => createElement(RecoverySetupPage), "/onboarding/recovery-setup")
        await until(() => text().includes("Your new 24 words"))
        expect(text()).not.toContain("Bring your history with you.")
    })

    it("a pending key — a start over cut short by a reload — goes to the setup page that settles it", async () => {
        const { idp, phone, net } = await account()
        await phone.e2ee.mintHistoryKey(2)
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => at() === "/onboarding/recovery-setup")
    })
})

describe("“Start over” on the new-device page", () => {
    const page = () => createElement(RecoveryRestorePage)

    beforeEach(() => {
        // jsdom has no `CSS.escape`, which React Aria's modal reads.
        if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("warns of what is erased, of the conversations this device won't see, and that a device still held warns and comes back with a code typed here", async () => {
        const { idp, phone, net } = await account()
        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=words")
        await until(() => tab("Start over") !== undefined)
        await press(tab("Start over"))

        expect(text()).toContain("No device left, no words left?")
        expect(text()).toContain("This device gets a new passphrase and becomes your reference.")
        expect(text()).toContain("Your saved history is erased")
        expect(text()).toContain("this device won't see your existing conversations unless a device you still have comes back")
        expect(text()).toContain("it will warn you, and can come back with a code typed here")
        expect(text()).toContain("Your account, your friends and new conversations stay.")
        expect(text()).not.toContain("ask you to approve this one")
        expect(button("Erase and start over")).toBeDefined()
    })

    it("with a recent password: the new words only once the IdP took them, then on to the app", async () => {
        const { idp, phone, net } = await account()
        signedInAgo(phone, idp, net, 60_000)
        const answered = deferred<void>()
        const setKey = vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await answered.promise
            return FakeHistoryIdp.prototype.setKey.apply(idp, args)
        })
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)

        await press(button("Erase and start over"))
        await until(() => setKey.mock.calls.length === 1)
        expect(button("Starting over…")?.disabled).toBe(true)
        expect(text()).not.toContain("Your new 24 words")
        expect(phone.storage.kept).toBeNull()

        await act(async () => answered.resolve())
        await until(() => text().includes("Your new 24 words"))
        const words = phone.storage.kept!.words
        expect(words).toHaveLength(24)
        for (const word of words) expect(text()).toContain(word)
        expect(idp.key).toMatchObject({ generation: 2, setByDevice: phone.storage.deviceId })
        expect(idp.log).toContain("key packages")

        const writeText = vi.fn(async () => undefined)
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
        await press(button("Copy passphrase"))
        expect(writeText).toHaveBeenCalledWith(words.join(" "))
        await until(() => vi.mocked(toast.success).mock.calls.some(([message]) => message === "Passphrase copied"))

        await press(button("Continue"))
        await until(() => at() === "/home")
    })

    it("with a password typed too long ago: asks it again before minting anything, comes back to the tab, and finishes once confirmed again", async () => {
        const { idp, phone, net } = await account()
        signedInAgo(phone, idp, net, 10 * 60_000)
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)

        await press(button("Erase and start over"))
        await until(() => button("Continue", document.body) !== undefined)
        expect(document.body.textContent).toContain("To start over, sign in again on idp.test")
        expect(phone.storage.pending).toBeNull()
        expect(phone.sealer.derivations).toBe(0)
        expect(idp.key?.generation).toBe(1)

        await press(button("Continue", document.body))
        expect(login.start).toHaveBeenCalledWith(IDP, undefined, wired.platform, {
            reauthenticate: true,
            returnTo: "/onboarding/recovery-restore?tab=start-over",
        })
        await unmount()

        // Back from the IdP's page: a fresh password, the page on its tab, its request matured, nothing done by itself.
        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Finish starting over")?.disabled === false)
        expect(openTab()).toBe("Start over")
        await advance(5_000)
        expect(router.state.location.searchStr).toBe("")
        expect(idp.key?.generation).toBe(1)
        expect(phone.storage.pending).toBeNull()

        await press(button("Finish starting over"))
        await until(() => text().includes("Your new 24 words"))
        expect(idp.key?.generation).toBe(2)
    })

    it("a 401 asking for the password anyway takes the same way, its pending key erased", async () => {
        const { idp, phone, net } = await account()
        signedInAgo(phone, idp, net)
        idp.recentSignIn = () => false
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)

        await press(button("Erase and start over"))
        await until(() => button("Continue", document.body) !== undefined)
        expect(phone.storage.pending).toBeNull()
        expect(phone.storage.kept).toBeNull()
        expect(text()).not.toContain("Your new 24 words")
    })

    it("two devices at once: the loser shows no words, says so, and goes back through the gate", async () => {
        const { idp, phone, net } = await account()
        signedInAgo(phone, idp, net)
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await startOverElsewhere(idp)
            return FakeHistoryIdp.prototype.setKey.apply(idp, args)
        })
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)

        await press(button("Erase and start over"))
        await until(() => text().includes("Another of your devices set a new passphrase at the same moment"))
        expect(document.activeElement?.textContent).toContain("Another of your devices set a new passphrase")

        // The gate keeps it on this page, read anew: the other device's generation, a code to let it in.
        await until(() => openTab() === "Another device" && shownCode().length === 6)
        expect(at()).toBe("/onboarding/recovery-restore")
        expect(text()).not.toContain("Your new 24 words")
        expect(phone.storage.pending).toBeNull()
        expect(phone.storage.kept).toBeNull()
        expect(idp.key?.setByDevice).not.toBe(phone.storage.deviceId)

        await press(tab("My 24 words"))
        expect(text()).not.toContain("Another of your devices set a new passphrase")
    })

    it("another generation landing right after its own: says so, shows no words, and the gate sends it on, its kept words letting it in", async () => {
        const { idp, phone, net } = await account()
        signedInAgo(phone, idp, net)
        vi.spyOn(net.directory, "approveByPassphrase").mockImplementationOnce(async () => {
            idp.key = { ...idp.key!, generation: 3, salt: new Uint8Array(16).fill(7), setByDevice: "rival" }
            throw new IdpError(409, "stale_history_key", "Not the account's current history key")
        })
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)

        await press(button("Erase and start over"))
        await until(() => text().includes("This device started over, then another of your devices set a newer passphrase"))
        // The rival is no device it found approved: no reset page, the app under its banner.
        await until(() => at() === "/home")
        expect(text()).not.toContain("Your new 24 words")
    })
})

describe("a start over that waits for the approved devices", () => {
    const page = () => createElement(RecoveryRestorePage)
    const DAY = 86_400_000
    const readyAt = (idp: FakeHistoryIdp) => Math.max(idp.startOvers[0].createdAt, idp.approvedLastUse ?? 0) + 7 * DAY

    beforeEach(() => {
        if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    /** The laptop approved and in use; the phone, on its new-device page, asks. */
    async function asked() {
        const accounts = await account()
        accounts.idp.startOverRule = true
        accounts.idp.approvedLastUse = Date.now()
        signedInAgo(accounts.phone, accounts.idp, accounts.net)
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)
        expect(text()).toContain("Your approved devices, if any, are told first: you finish here once none of them has been used for 7 days.")
        await press(button("Erase and start over"))
        await until(() => text().includes("Your other devices have been told."))
        return accounts
    }

    it("asks first: the other devices told, the date it may finish in the reader's words, nothing erased", async () => {
        const { idp, phone } = await asked()
        expect(text()).toContain(`If none of them is used for 7 days, you can finish here on ${momentLabel(readyAt(idp))}.`)
        expect(idp.startOvers).toHaveLength(1)
        expect(idp.key?.generation).toBe(1)
        expect(phone.storage.pending).toBeNull()
        expect(button("Erase and start over")).toBeUndefined()
        expect(button("Finish starting over")).toBeUndefined()
    })

    it("keeps the date current as the approved devices are used, read again on a calm interval", async () => {
        const { idp } = await asked()
        const before = momentLabel(readyAt(idp))
        await advance(60 * 60_000)
        idp.approvedLastUse = Date.now()
        const after = momentLabel(readyAt(idp))
        expect(after).not.toBe(before)
        await until(() => text().includes(after), 30_000)
        expect(text()).not.toContain(before)
    })

    it("offers the code instead, on the “Another device” tab, and withdrawing goes back to the choice", async () => {
        const { idp } = await asked()
        expect(text()).toContain("Still have one of your devices? Approving this one with a code from it is quicker, and keeps your history.")
        await press(button("Approve with another device instead"))
        await until(() => openTab() === "Another device")

        await press(tab("Start over"))
        await until(() => button("Withdraw the request") !== undefined)
        await press(button("Withdraw the request"))
        await until(() => button("Erase and start over")?.disabled === false)
        expect(idp.startOvers[0].ended?.reason).toBe("withdrawn")
    })

    it("opens on its tab after a reload while it waits, and once matured, “Finish starting over” runs the start over", async () => {
        const { idp, phone, net } = await asked()
        await unmount()

        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => openTab() === "Start over" && text().includes("Waiting on your other devices"))

        // A week on, no approved device used since.
        idp.startOvers[0].createdAt -= 8 * DAY
        idp.approvedLastUse = Date.now() - 8 * DAY
        await until(() => button("Finish starting over")?.disabled === false, 30_000)
        expect(text()).toContain("None of your other devices has been used for 7 days.")

        await press(button("Finish starting over"))
        await until(() => text().includes("Your new 24 words"))
        expect(idp.key).toMatchObject({ generation: 2, setByDevice: phone.storage.deviceId })
        expect(idp.startOvers[0].ended?.reason).toBe("used")
    })

    it("a finish the IdP finds too early moves the date shown, nothing kept", async () => {
        const { idp, phone } = await asked()
        idp.startOvers[0].createdAt -= 8 * DAY
        idp.approvedLastUse = Date.now() - 8 * DAY
        await until(() => button("Finish starting over")?.disabled === false, 30_000)

        // The laptop used just now: the IdP refuses, and the screen waits again with the new date.
        idp.approvedLastUse = Date.now()
        await press(button("Finish starting over"))
        await until(() => text().includes(`you can finish here on ${momentLabel(readyAt(idp))}`))
        expect(idp.key?.generation).toBe(1)
        expect(phone.storage.pending).toBeNull()
    })

    it("says plainly that one of the user's devices cancelled it — after a reload too — and may ask again", async () => {
        const { idp, laptop, phone, net } = await asked()
        await idp.startOverRoutes().end(IDP, laptop.token, idp.startOvers[0].id)
        const said = "One of your devices cancelled your request to start over."
        await until(() => text().includes(said), 30_000)
        expect(button("Erase and start over")?.disabled).toBe(false)
        await unmount()

        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => text().includes(said))
    })

    it("another device's request open: explained as the page reads it, nothing to ask with", async () => {
        const { idp, phone, net } = await account()
        idp.approvedLastUse = Date.now()
        const tablet = historyDevice(idp, "tablet")
        await nameSession(tablet)
        await idp.startOverRoutes().ask(IDP, tablet.token)
        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=start-over")

        await until(() => text().includes("Another device asked first"))
        expect(text()).toContain("only one request can be open at a time")
        expect(button("Erase and start over")).toBeUndefined()
        expect(button("Approve with another device instead")).toBeDefined()
        expect(idp.startOvers).toHaveLength(1)
    })

    it("approved by another device meanwhile: says so, and goes where the gate says — still out here, back to the code tab", async () => {
        const { idp } = await asked()
        idp.startOvers[0].ended = { reason: "approved", at: Date.now() }
        await until(() => text().includes("Another of your devices approved this one"), 30_000)
        await until(() => openTab() === "Another device")
        expect(at()).toBe("/onboarding/recovery-restore")
    })

    it("on a device whose clock runs ahead: “not yet” with the IdP's date, and no press mints anything until it may", async () => {
        const { idp, phone } = await asked()
        // The instance's clock runs 30 minutes behind this device's; by it, the request matures in 15.
        idp.clockOffset = -30 * 60_000
        idp.startOvers[0].createdAt -= 8 * DAY
        idp.approvedLastUse = Date.now() - 7 * DAY - 15 * 60_000
        await until(() => button("Finish starting over")?.disabled === false, 30_000)
        const setKey = vi.spyOn(idp, "setKey")
        const minted = vi.spyOn(phone.e2ee, "mintHistoryKey")
        await press(button("Finish starting over"))
        await until(() => setKey.mock.calls.length === 1)

        await until(() => text().includes(`Not yet: you can finish on ${momentLabel(readyAt(idp))}.`))
        expect(button("Finish starting over")).toBeUndefined()
        expect(phone.storage.pending).toBeNull()
        expect(minted).toHaveBeenCalledOnce()

        // One reread on, its date unmoved, a press may go again.
        await until(() => button("Finish starting over") !== undefined, 30_000)
        expect(setKey).toHaveBeenCalledOnce()
        expect(minted).toHaveBeenCalledOnce()
    })

    it("after a reload, says new words ended its request, and opens on its tab to say so", async () => {
        const { idp, phone, net } = await asked()
        await unmount()
        idp.startOvers[0].ended = { reason: "superseded", at: Date.now() }
        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => openTab() === "Start over" && text().includes("One of your approved devices set new words, which ended your request to start over."))
        expect(button("Erase and start over")).toBeDefined()
    })

    it("after a reload, opens on its tab to say one of the user's devices cancelled it", async () => {
        const { idp, laptop, phone, net } = await asked()
        await idp.startOverRoutes().end(IDP, laptop.token, idp.startOvers[0].id)
        await unmount()
        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => openTab() === "Start over" && text().includes("One of your devices cancelled your request to start over."))
    })

    it("with no approved device to wait for, it goes straight on to finishing", async () => {
        const { idp, phone, net } = await account()
        idp.startOverRule = true
        idp.approvals.length = 0
        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/recovery-restore?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)
        await press(button("Erase and start over"))
        await until(() => text().includes("Your new 24 words"))
        expect(idp.startOvers[0]).toMatchObject({ deviceId: phone.storage.deviceId, ended: { reason: "used" } })
    })
})

describe("the reset page", () => {
    const page = () => createElement(RecoveryRestorePage, { variant: "reset" })

    it("sends a device holding words of the account on to the app at its check, after a start over by a device it never found approved, or a change no device made", async () => {
        const { idp, laptop, phone, net } = await account()
        await newWordsOn(phone, idp)
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        signIn(laptop, idp, net)
        await render(page, "/onboarding/history-reset")
        await until(() => at() === "/home")
        expect(laptop.storage.admission).toEqual({ kind: "in", by: "kept-words", cause: "reset-by-unapproved" })
        expect(net.requests.size).toBe(0)
        await unmount()

        const changed = await account()
        changed.idp.key = { ...changed.idp.key!, approvalPublicKey: ed25519.keygen().publicKey }
        await changed.laptop.e2ee.checkHistoryKey(IDP, changed.laptop.token)
        signIn(changed.laptop, changed.idp, changed.net)
        await render(page, "/onboarding/history-reset")
        await until(() => at() === "/home")
        expect(changed.laptop.storage.admission).toEqual({ kind: "in", by: "kept-words", cause: "unknown-change" })
    })

    it("after a device it found approved replaced the words: names that device — its code, its new words, a start over from here", async () => {
        const { idp, laptop, phone, net } = await account()
        laptop.storage.trust = { ...laptop.storage.trust, approved: [{ deviceId: phone.storage.deviceId, rootKey: phone.storage.rootKey.publicKey }] }
        await newWordsOn(phone, idp)
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        signIn(laptop, idp, net)
        await render(page, "/onboarding/history-reset")
        await until(() => text().includes("Your words were replaced on Chrome on Android"))

        expect(text()).not.toContain("Your history was reset from another device")
        expect(tabs()).toEqual(["That device", "Its 24 words", "Start over"])
        expect(text()).toContain("Open Pīna'i on Chrome on Android and type it when it asks.")

        await press(tab("Its 24 words"))
        expect(text()).toContain("The new words, from Chrome on Android: your old ones no longer open your history.")

        await press(tab("Start over"))
        expect(text()).toContain(
            "Then someone else replaced your words on Chrome on Android: it won't be approved, and once this device has started over, it can sign Chrome on Android out.",
        )
        // The password first: that device's holder has it, and it would cancel every request.
        expect(text()).toContain("First, your password")
        expect(text()).toContain("Whoever has Chrome on Android has your password too.")
        expect(text()).toContain("once you've signed in again, come back here to start over.")
        expect(button("Erase and start over")).toBeDefined()
    })

    it("“It wasn't me”: a cancel says whoever has that device has the password, to change first", async () => {
        const { idp, laptop, phone, net } = await account()
        laptop.storage.trust = { ...laptop.storage.trust, approved: [{ deviceId: phone.storage.deviceId, rootKey: phone.storage.rootKey.publicKey }] }
        await newWordsOn(phone, idp)
        idp.approvals.push({ deviceId: phone.storage.deviceId, generation: 2 })
        idp.approvedLastUse = Date.now()
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        signIn(laptop, idp, net)
        await render(page, "/onboarding/history-reset?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)
        await press(button("Erase and start over"))
        await until(() => text().includes("Your other devices have been told."))
        expect(text()).toContain("If it was you after all, approving this device with a code from Chrome on Android keeps your history.")

        await idp.startOverRoutes().end(IDP, phone.token, idp.startOvers[0].id)
        await until(
            () => text().includes("Your request to start over was cancelled. Whoever has Chrome on Android has your password: change it first, then ask again."),
            30_000,
        )
    })

    it("never says “reset from another device”, nor its instruction, before naming the device that replaced the words", async () => {
        const { idp, laptop, phone, net } = await account()
        laptop.storage.trust = { ...laptop.storage.trust, approved: [{ deviceId: phone.storage.deviceId, rootKey: phone.storage.rootKey.publicKey }] }
        await newWordsOn(phone, idp)
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        signIn(laptop, idp, net)
        const listed = deferred<void>()
        const list = net.directory.listDevices.bind(net.directory)
        vi.spyOn(net.directory, "listDevices").mockImplementation(async (...args) => {
            await listed.promise
            return list(...args)
        })
        const seen: string[] = []
        await render(page, "/onboarding/history-reset")
        for (let i = 0; i < 20; i++) {
            await advance(50)
            seen.push(text())
        }

        listed.resolve()
        await until(() => {
            seen.push(text())
            return text().includes("Your words were replaced on Chrome on Android")
        })
        expect(seen.some((shown) => shown.includes("reset from another device"))).toBe(false)
        expect(seen.some((shown) => shown.includes("Open Pīna'i on the device that reset your history"))).toBe(false)
    })

    it("“It wasn't me”: this device starts over from here, the next generation its own", async () => {
        const { idp, laptop, phone, net } = await account()
        laptop.storage.trust = { ...laptop.storage.trust, approved: [{ deviceId: phone.storage.deviceId, rootKey: phone.storage.rootKey.publicKey }] }
        await newWordsOn(phone, idp)
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        signedInAgo(laptop, idp, net)
        await render(page, "/onboarding/history-reset?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)
        expect(openTab()).toBe("Start over")

        await press(button("Erase and start over"))
        await until(() => text().includes("Your new 24 words"))

        expect(idp.key).toMatchObject({ generation: 3, setByDevice: laptop.storage.deviceId })
        expect(laptop.storage.kept?.generation).toBe(3)
        expect(await laptop.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 3, settled: true })
    })

    it("for a change no device made, on a device that never held words: no code, no words — “Check again”, a start over from here, signing out", async () => {
        const { idp, phone, net } = await account()
        phone.storage.newest = 2
        await phone.e2ee.checkHistoryKey(IDP, phone.token)
        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/history-reset")
        await until(() => text().includes("Your instance changed your history key") && button("Sign out")?.disabled === false)
        await advance(10_000)

        expect(text()).toContain("None of your devices set a new passphrase")
        expect(tabs()).toEqual([])
        expect(text()).not.toContain("Approval code")
        expect(container.querySelectorAll("input").length).toBe(0)
        expect(net.requests.size).toBe(0)
        expect(button("Sign out")).toBeDefined()

        await press(button("Start over from here"))
        expect(text()).toContain("becomes your reference, whatever your instance changed")
        await until(() => button("Erase and start over")?.disabled === false)
        await press(button("← What happened"))
        await press(button("Check again"))
        await until(() => at() === "/home")
    })

    it("for a key gone back under one this device saw: only the instance can put it back — no start over, “Check again”, signing out", async () => {
        const { idp, phone, net } = await account()
        phone.storage.newest = 2
        await phone.e2ee.checkHistoryKey(IDP, phone.token)
        signedInAgo(phone, idp, net)
        await render(page, "/onboarding/history-reset?tab=start-over")
        await until(() => button("Erase and start over")?.disabled === false)

        await press(button("Erase and start over"))
        await until(() => text().includes("Your instance went back on your account's history key"))
        expect(text()).toContain("only your instance can put the key back")
        expect(button("Erase and start over")).toBeUndefined()
        expect(button("Sign out")).toBeDefined()
        expect(idp.key?.generation).toBe(1)
        expect(phone.storage.pending).toBeNull()

        await press(button("Check again"))
        await until(() => at() === "/home")
    })

    it("a device that turns out in goes back to the app", async () => {
        const { idp, laptop, net } = await account()
        signIn(laptop, idp, net)
        await render(page, "/onboarding/history-reset")
        await until(() => at() === "/home")
    })

    it("says only that the key changed until it knows how, offering no way in meanwhile — “Check again” and signing out", async () => {
        const { idp, phone, net } = await account()
        signIn(phone, idp, net)
        vi.spyOn(phone.e2ee, "checkHistoryKey").mockReturnValue(new Promise(() => undefined))
        await render(page, "/onboarding/history-reset")
        await until(() => button("Sign out") !== undefined)

        expect(text()).toContain("Your history key changed")
        expect(text()).not.toContain("Approval code")
        expect(tabs()).toEqual([])
        expect(container.querySelectorAll("input").length).toBe(0)
        expect(button("Check again")).toBeDefined()
    })
})
