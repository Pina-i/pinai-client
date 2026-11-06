/**
 * Where the user sees a key share land (`identity-provider/specs/e2ee.md § 3.11`, § 6.10), the real
 * restore page and the app's hook over real E2EE engines and fakes keeping the IdP's rules, on fake
 * timers. The restore page reads its share from mount; once approved, "Approved — bringing your
 * history…", then "Your history is back", then the app — after the restore, `RESTORE_WAIT_MS` at
 * most, or `SHARE_WAIT_AFTER_IN_MS` let in without a share. A share failing its checks is said, and
 * points to the words. In the app, the share is taken at startup, on `history_key_ready` and on a
 * reconnect; the restore runs behind the app with a toast that outlives no restore. One accept at a
 * time, whoever asks.
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
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { sealKeyShare } from "@pinai/crypto/key-share"
import type { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { RESTORE_WAIT_MS, SHARE_WAIT_AFTER_IN_MS } from "@pinai/domain/models/approval-handshake"
import type { UserProfile } from "@pinai/domain/models/auth"
import { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { acceptHistoryShareUseCase } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { useHistoryShare } from "@/presentation/hooks/use-history-share"
import { RecoveryRestorePage } from "@/presentation/pages/onboarding/RecoveryRestorePage/RecoveryRestorePage"
import { useAppStore } from "@/store/store"

import { ACTOR, IDP } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"
import { CONVERSATION, bundleHpke, sharingAccount, type SharingAccount, type SharingDevice } from "./setup/key-shares"

const wired = vi.hoisted(() => ({
    e2ee: null as unknown,
    relay: null as unknown,
    directory: null as unknown,
    history: null as unknown,
    keyShares: null as unknown,
    session: null as unknown,
    ready: null as (() => void) | null,
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn(), loading: vi.fn() }))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.e2ee,
    getApprovalRelayPort: () => wired.relay,
    getDeviceDirectoryPort: () => wired.directory,
    getHistoryArchivePort: () => wired.history,
    getKeySharePort: () => wired.keyShares,
    getSessionPort: () => wired.session,
    getStartOverPort: () => ({ read: async () => null }),
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

const issuers = new FakeIssuers()
let hpke: MlsAdapter

beforeAll(async () => {
    hpke = await bundleHpke()
})

const roots: Array<{ root: Root; container: HTMLElement }> = []
let container: HTMLElement
let router: AnyRouter

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    for (const fn of Object.values(toast)) fn.mockReset()
    useAppStore.setState({ dmMessages: {} })
})

afterEach(async () => {
    for (const { root, container } of roots.splice(0)) {
        await act(async () => root.unmount())
        container.remove()
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
})

async function mount(element: ReturnType<typeof createElement>): Promise<() => Promise<void>> {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const held = { root, container: host }
    roots.push(held)
    await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient() }, element)))
    return async () => {
        roots.splice(roots.indexOf(held), 1)
        await act(async () => root.unmount())
        host.remove()
    }
}

/** The restore page at its route, beside the routes it may go on to. */
async function restorePage() {
    const rootRoute = createRootRoute({ component: Outlet })
    const page = createRoute({ getParentRoute: () => rootRoute, path: "/onboarding/recovery-restore", component: () => createElement(RecoveryRestorePage) })
    const home = createRoute({ getParentRoute: () => rootRoute, path: "/home", component: () => null })
    router = createRouter({
        routeTree: rootRoute.addChildren([page, home]),
        history: createMemoryHistory({ initialEntries: ["/onboarding/recovery-restore"] }),
    })
    await mount(createElement(RouterProvider, { router }))
    container = roots[roots.length - 1].container
}

function App() {
    useHistoryShare()
    const conversations = useAppStore((s) => Object.keys(s.dmMessages).length)
    return createElement("p", null, `conversations: ${conversations}`)
}

async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
    })
}

async function until(check: () => boolean, step = 50) {
    for (let i = 0; i < 400 && !check(); i++) await advance(step)
    expect(check()).toBe(true)
}

const at = () => router.state.location.pathname
const text = () => container.textContent ?? ""
const sectionStatus = () => container.querySelector('[aria-label="Approve from another device"] [role="status"]')?.textContent ?? ""
const shownCode = () => (container.querySelector('[aria-label^="Approval code"]')?.getAttribute("aria-label") ?? "").replace(/\D/g, "")
const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)
const restored = () => (useAppStore.getState().dmMessages[CONVERSATION] ?? []).map((m) => m.content)

function signIn(device: SharingDevice, a: SharingAccount) {
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

/** The archive's page download, held until the test lets it go — or fails it. */
function heldDownload(a: SharingAccount) {
    const original = a.idp.downloadPage.bind(a.idp)
    let release!: () => void
    let fail!: (error: Error) => void
    const gate = new Promise<void>((resolve, reject) => ((release = resolve), (fail = reject)))
    const reads = vi.spyOn(a.idp, "downloadPage").mockImplementation(async () => {
        await gate
        return original()
    })
    return { reads, release, fail }
}

/** The account, the phone on its restore page, the laptop answering its code; nothing shared yet. */
async function approvedOnThePage(texts = ["first", "second"]) {
    const a = await sharingAccount(hpke, issuers)
    await a.archive(a.laptop, texts)
    signIn(a.phone, a)
    await restorePage()
    await until(() => shownCode().length === 6)
    const door = new ApprovalAnswering(
        { e2ee: a.laptop.e2ee, relay: a.net.relay, directory: a.shares.directory(), sharing: a.sharing(a.laptop) },
        a.net.context(a.laptop),
    )
    await act(async () => door.refresh())
    await act(async () => door.answer(shownCode()))
    for (let i = 0; i < 10 && !text().includes("This device is approved."); i++) {
        await act(async () => door.poll())
        await advance(3_000)
    }
    expect(text()).toContain("This device is approved.")
    return a
}

/** The laptop shares, as `device_approved` brings it to, and the page reads its share at once. */
async function shareNow(a: SharingAccount) {
    await a.refresh(a.laptop)
    await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"))
    })
}

/** When the method was called, on the fake clock. */
function calledAt<T extends object>(target: T, method: keyof T) {
    const times: number[] = []
    const current = target[method] as unknown as (...args: unknown[]) => unknown
    // A method the device already stands in for keeps its stand-in.
    const original = vi.isMockFunction(current) ? (current.getMockImplementation() as typeof current) : current.bind(target)
    vi.spyOn(target, method as never).mockImplementation(((...args: unknown[]) => {
        times.push(Date.now())
        return original(...args)
    }) as never)
    return times
}

describe("the asking section, once approved", () => {
    it("says “Approved — bringing your history…” while the archive comes, then “Your history is back”, then goes on", async () => {
        const a = await approvedOnThePage()
        const download = heldDownload(a)
        await shareNow(a)

        await until(() => download.reads.mock.calls.length === 1)
        expect(sectionStatus()).toBe("Approved — bringing your history…")
        expect(a.phone.storage.kept?.words).toEqual(a.words)
        expect(at()).toBe("/onboarding/recovery-restore")

        download.release()
        await until(() => sectionStatus() === "Your history is back", 10)
        expect(restored()).toEqual(["first", "second"])
        await advance(1_400)
        expect(at()).toBe("/onboarding/recovery-restore")
        await until(() => at() === "/home", 10)
    })

    it("waits at most RESTORE_WAIT_MS for the restore once the words are kept, then goes on as it carries on", async () => {
        const a = await approvedOnThePage()
        const download = heldDownload(a)
        const kept = calledAt(a.phone.e2ee, "keepPassphrase")
        await shareNow(a)
        await until(() => kept.length === 1 && download.reads.mock.calls.length === 1, 10)

        await advance(kept[0] + RESTORE_WAIT_MS - 50 - Date.now())
        expect(at()).toBe("/onboarding/recovery-restore")
        await advance(100)
        expect(at()).toBe("/home")

        download.release()
        await until(() => restored().length === 2)
    })

    it("says when the restore fails, then goes on: it is tried again at the next start", async () => {
        const a = await approvedOnThePage()
        const download = heldDownload(a)
        await shareNow(a)
        await until(() => download.reads.mock.calls.length === 1)

        download.fail(new TypeError("Failed to fetch"))
        await until(() => sectionStatus() === "Approved. Your history comes back the next time Pīna'i starts.", 10)
        await until(() => at() === "/home", 10)
        expect(a.phone.storage.restoreDue).toEqual({ generation: 1, appliedAt: null })
    })

    it("let in without a share, goes on SHARE_WAIT_AFTER_IN_MS after it is in, not before", async () => {
        const a = await sharingAccount(hpke, issuers)
        const registered = calledAt(a.phone.e2ee, "register")
        signIn(a.phone, a)
        await restorePage()
        await until(() => shownCode().length === 6)
        const door = new ApprovalAnswering({ e2ee: a.laptop.e2ee, relay: a.net.relay, directory: a.shares.directory() }, a.net.context(a.laptop))
        await act(async () => door.refresh())
        await act(async () => door.answer(shownCode()))
        // Small steps: the wait starts as the render that saw it in, not at the end of a long one.
        for (let i = 0; i < 10 && registered.length === 0; i++) {
            await act(async () => door.poll())
            for (let t = 0; t < 3_000 && registered.length === 0; t += 10) await advance(10)
        }
        expect(registered).toHaveLength(1)

        await advance(registered[0] + SHARE_WAIT_AFTER_IN_MS - 50 - Date.now())
        expect(at()).toBe("/onboarding/recovery-restore")
        await advance(100)
        expect(at()).toBe("/home")
    })

    it("says a share it couldn't use came from that device, points to the words, and stays", async () => {
        const a = await approvedOnThePage()
        const bad = await sealKeyShare({
            hpke,
            actorUri: ACTOR,
            sender: a.laptop.storage.deviceId,
            recipient: a.phone.storage.deviceId,
            generation: 1,
            words: generateMnemonic(wordlist, 256).split(" "),
            recipientHpkeKey: a.phone.storage.hpkeKey.publicKey,
            senderRootSecret: a.laptop.storage.rootKey.secretKey,
        })
        a.shares.plant(a.phone.storage.deviceId, { ...bad, senderDeviceId: a.laptop.storage.deviceId, createdAt: "2026-11-04T00:00:00Z" })
        await act(async () => {
            document.dispatchEvent(new Event("visibilitychange"))
        })

        await until(() => sectionStatus().startsWith("Approved, but your history couldn't be received from that device."))
        expect(sectionStatus()).toContain("Type your 24 words to bring it back.")
        expect([...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toContain("My 24 words")
        await until(() => button("Go on without it") !== undefined)
        await advance(SHARE_WAIT_AFTER_IN_MS + 1_000)
        expect(at()).toBe("/onboarding/recovery-restore")

        await act(async () => button("Go on without it")?.click())
        await until(() => at() === "/home")
        expect(a.phone.storage.kept).toBeNull()
    })
})

describe("the restore page at mount", () => {
    it("takes a share already waiting — approved before a reload — and goes on, the archive coming behind", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.archive(a.laptop, ["first"])
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        signIn(a.phone, a)

        await restorePage()

        await until(() => at() === "/home")
        expect(a.phone.storage.kept?.words).toEqual(a.words)
        await until(() => restored().length === 1)
    })

    it("says a refused share there too, before any approval, beside the words", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.handshake(a.phone, a.laptop)
        const bad = await sealKeyShare({
            hpke,
            actorUri: ACTOR,
            sender: a.laptop.storage.deviceId,
            recipient: a.phone.storage.deviceId,
            generation: 1,
            words: a.words,
            recipientHpkeKey: (await hpke.generateKeyPair()).publicKey,
            senderRootSecret: a.laptop.storage.rootKey.secretKey,
        })
        a.shares.plant(a.phone.storage.deviceId, { ...bad, senderDeviceId: a.laptop.storage.deviceId, createdAt: "2026-11-04T00:00:00Z" })
        signIn(a.phone, a)

        await restorePage()

        await until(() => text().includes("Your history couldn't be received from your other device. Type your 24 words to bring it back."))
        expect(at()).toBe("/onboarding/recovery-restore")
    })
})

describe("one accept at a time", () => {
    it("the share taken on the asking page as the app mounts is kept and approved once, and restored", async () => {
        const a = await approvedOnThePage()
        await until(() => a.idp.log.includes("key packages"), 500)
        await advance(59_000)
        const approvals = () => a.idp.approvals.filter((x) => x.deviceId === a.phone.storage.deviceId).length
        const reports = () => a.idp.log.filter((line) => line === "report 1").length
        const reportsBefore = reports()
        await a.refresh(a.laptop)

        const host = document.createElement("div")
        document.body.appendChild(host)
        const appRoot = createRoot(host)
        roots.push({ root: appRoot, container: host })
        await act(async () => {
            document.dispatchEvent(new Event("visibilitychange"))
            appRoot.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(App)))
        })
        await until(() => a.phone.storage.kept !== null, 10)
        await until(() => restored().length === 2)

        expect(approvals()).toBe(1)
        expect(reports() - reportsBefore).toBe(1)
    })
})

describe("in the app", () => {
    it("takes the share on history_key_ready and restores behind the app, a toast in the corner saying so", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.archive(a.laptop, ["first"])
        await a.handshake(a.phone, a.laptop)
        signIn(a.phone, a)
        const download = heldDownload(a)
        await mount(createElement(App))
        container = roots[0].container
        await advance(100)
        expect(a.phone.storage.kept).toBeNull()

        await a.refresh(a.laptop)
        await act(async () => wired.ready?.())
        await until(() => download.reads.mock.calls.length === 1)
        expect(toast.loading).toHaveBeenCalledWith("Bringing your history back…", { id: "history-restore" })

        // The app goes on while the archive comes.
        await act(async () => useAppStore.setState({ dmMessages: { elsewhere: [] } }))
        expect(container.textContent).toBe("conversations: 1")
        expect(restored()).toEqual([])

        download.release()
        await until(() => toast.success.mock.calls.length === 1)
        expect(toast.success).toHaveBeenCalledWith("Your history is back", { id: "history-restore", description: "1 message" })
        expect(restored()).toEqual(["first"])
        expect(container.textContent).toBe("conversations: 2")
    })

    it("says in the corner when the restore fails, and settles the toast even once the app is gone", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.archive(a.laptop, ["first"])
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        signIn(a.phone, a)
        const download = heldDownload(a)
        const unmount = await mount(createElement(App))
        await until(() => toast.loading.mock.calls.length === 1)

        await unmount()
        download.fail(new TypeError("Failed to fetch"))
        await until(() => toast.error.mock.calls.length === 1)
        expect(toast.error).toHaveBeenCalledWith("Your history couldn't be brought back", {
            id: "history-restore",
            description: "It's tried again the next time Pīna'i starts.",
        })
    })

    it("takes a share already waiting as the app starts", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.archive(a.laptop, ["first"])
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        signIn(a.phone, a)

        await mount(createElement(App))

        await until(() => restored().length === 1)
        expect(a.phone.storage.kept?.words).toEqual(a.words)
    })

    it("reads its share again when the socket comes back, a push maybe missed", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.handshake(a.phone, a.laptop)
        signIn(a.phone, a)
        await mount(createElement(App))
        await advance(100)

        await act(async () => useAppStore.setState({ wsStatus: "disconnected" }))
        await a.refresh(a.laptop)
        await advance(100)
        expect(a.phone.storage.kept).toBeNull()
        await act(async () => useAppStore.setState({ wsStatus: "connected" }))

        await until(() => a.phone.storage.kept !== null)
    })

    it("runs a restore left due as the app starts", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.archive(a.laptop, ["first"])
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        expect(await acceptHistoryShareUseCase(a.phone.deps)(IDP, a.phone.token, ACTOR)).toEqual({ kind: "kept", generation: 1 })
        signIn(a.phone, a)

        await mount(createElement(App))

        await until(() => a.phone.storage.restoreDue?.appliedAt != null)
        expect(restored()).toEqual(["first"])
    })
})
