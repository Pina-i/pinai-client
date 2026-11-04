/**
 * The onboarding gate, the KeyPackage tick it enables, and the pages it keeps a device on, rendered
 * in a memory router over real E2EE engines, on fake timers (`identity-provider/specs/e2ee.md § 3.6`;
 * the design's § 5.2 and § 5.4).
 *
 * The gate checks as it mounts, then in the background: at a route change, at most once in 30 s and
 * never while a check runs, and at once when the device hears its key changed. The newest check
 * decides; one that fails, or one finishing after an unmount or a sign-out, changes nothing. A device
 * let in isn't stopped where it stands. The new-device page has no "Start fresh": the code, the 24
 * words, or signing out — and "Back" only for a device already in. The reset page offers that device
 * and its 24 words after a start over elsewhere; after a change no start over explains, neither — only
 * "Check again", signing out and a start over from here not yet offered.
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
import { useAppStore } from "@/store/store"

import { FakeAccount } from "./setup/approval-relay"
import { ACTOR, FakeHistoryIdp, IDP, MemoryHistoryStorage, historyDevice } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"

const wired = vi.hoisted(() => ({
    e2ee: null as unknown,
    session: null as unknown,
    history: null as unknown,
    directory: null as unknown,
    relay: null as unknown,
    platform: null as unknown,
    lowHandler: null as (() => void) | null,
}))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.e2ee,
    getSessionPort: () => wired.session,
    getHistoryArchivePort: () => wired.history,
    getDeviceDirectoryPort: () => wired.directory,
    getApprovalRelayPort: () => wired.relay,
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
    await idp.session().linkDevice(IDP, other.token, other.storage.deviceId)
    await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey(2)).key)
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

    it("doesn't stop a device let in where it stands, and sends it to the reset page at the next route once it turned out", async () => {
        const { idp, checks } = await inThenWatched()
        await startOverElsewhere(idp)

        await advance(31_000)
        expect(checks).not.toHaveBeenCalled()
        expect(at()).toBe("/home")
        expect(gate.status).toBe("ready")

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

    it("checks at once when the device hears its key changed, route change or not", async () => {
        const { idp, laptop, checks } = await inThenWatched()
        idp.key = { ...idp.key!, approvalPublicKey: ed25519.keygen().publicKey }

        // As an upload's stale_history_key would: the key read again, the change heard.
        await act(async () => {
            await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        })

        await until(() => at() === "/onboarding/history-reset")
        expect(checks.mock.calls.length).toBeGreaterThanOrEqual(2)
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

describe("the new-device page", () => {
    const page = () => createElement(RecoveryRestorePage)
    const text = () => container.textContent ?? ""
    const button = (label: string) =>
        [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined

    it("has no “Start fresh”: the code, the 24 words, or signing out", async () => {
        const { idp, phone, net } = await account()
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => text().includes("Approval code") && button("Paste passphrase")?.disabled === false)

        expect(text()).not.toMatch(/start fresh/i)
        expect(text()).toContain("Or with your 24 words")
        expect(text()).toContain("No device and no words left?")
        expect(container.querySelectorAll("input").length).toBe(24)
        expect(button("Sign out")).toBeDefined()
        expect(button("Back to Pīna'i")).toBeUndefined()
    })

    it("signs out with “Sign out”", async () => {
        const { idp, phone, net } = await account()
        signIn(phone, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => button("Sign out") !== undefined)

        await act(async () => button("Sign out")?.click())

        const { navigation, tokens } = wired.platform as ReturnType<typeof platform>
        expect(navigation.navigateTo).toHaveBeenCalledWith("/")
        expect(tokens.clear).toHaveBeenCalled()
        expect(useAppStore.getState().accessToken).toBeNull()
    })

    it("offers “Back” to a device already in, which came to type its words", async () => {
        const { idp, laptop, net } = await account()
        signIn(laptop, idp, net)
        await render(page, "/onboarding/recovery-restore")
        await until(() => button("Back to Pīna'i") !== undefined)

        await act(async () => button("Back to Pīna'i")?.click())
        await until(() => at() === "/home")
    })
})

describe("the reset page", () => {
    const page = () => createElement(RecoveryRestorePage, { variant: "reset" })
    const text = () => container.textContent ?? ""
    const button = (label: string) =>
        [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined

    it("after a start over elsewhere: that device, its 24 words, a start over from here not yet offered, signing out", async () => {
        const { idp, laptop, net } = await account()
        await startOverElsewhere(idp)
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        signIn(laptop, idp, net)
        await render(page, "/onboarding/history-reset")
        await until(() => text().includes("Your history was reset from another device") && text().includes("Approval code"))

        expect(text()).toContain("That device")
        expect(text()).toContain("Open Pīna'i on the device that reset your history and type it when it asks.")
        expect(text()).toContain("Or its 24 words")
        expect(container.querySelectorAll("input").length).toBe(24)
        expect(button("Restore")).toBeDefined()
        expect(button("It wasn't me — start over from here")?.disabled).toBe(true)
        expect(text()).toContain("This comes with the start over, in a later release.")
        expect(button("Sign out")).toBeDefined()
        expect(button("Check again")).toBeUndefined()
        expect(text()).not.toMatch(/start fresh/i)
    })

    it("for a key changed under the same generation: no code, no words — the instance putting it back, signing out, a start over", async () => {
        const { idp, laptop, net } = await account()
        idp.key = { ...idp.key!, approvalPublicKey: ed25519.keygen().publicKey }
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        signIn(laptop, idp, net)
        await render(page, "/onboarding/history-reset")
        await until(() => text().includes("Your history was reset for an unknown change") && button("Sign out")?.disabled === false)
        await advance(10_000)

        expect(text()).toContain("none of your devices did this")
        expect(text()).toContain("Your instance puts the key back")
        expect(text()).not.toContain("Approval code")
        expect(text()).not.toContain("Or its 24 words")
        expect(container.querySelectorAll("input").length).toBe(0)
        expect(button("Restore")).toBeUndefined()
        expect(net.requests.size).toBe(0)
        expect(button("It wasn't me — start over from here")?.disabled).toBe(true)
        expect(button("Sign out")).toBeDefined()

        await act(async () => button("Check again")?.click())
        await until(() => at() === "/home")
    })

    it("says only that the key changed until it knows how, offering no way in meanwhile", async () => {
        const { idp, phone, net } = await account()
        signIn(phone, idp, net)
        vi.spyOn(phone.e2ee, "checkHistoryKey").mockReturnValue(new Promise(() => undefined))
        await render(page, "/onboarding/history-reset")
        await until(() => button("Sign out") !== undefined)

        expect(text()).toContain("Your history key changed")
        expect(text()).not.toContain("Approval code")
        expect(container.querySelectorAll("input").length).toBe(0)
    })
})
