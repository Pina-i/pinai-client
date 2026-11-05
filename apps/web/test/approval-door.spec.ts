/**
 * The two screens of the code handshake, over real E2EE engines and a relay keeping the IdP's rules.
 *
 * The Door (`ApprovalAnswering`, then its view model): it opens for another device's unanswered
 * request — listed on load, pushed, or read again when the socket comes back —, never on a device
 * that doesn't act, closes on `approval_closed`, leaves an unanswered request alone when closed and
 * ends one it took part in, never tries a code twice, lets one tab answer, gives up after its
 * timeout, can be cancelled but not escaped while it works, and drops an older read of the list.
 *
 * The asking section: the code as 3 + 3, when the next one comes, this device and the devices to
 * approve from; one request under StrictMode; its request ended when it goes, when the page goes,
 * or when the 24 words are typed; no reads while the page is hidden.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode, act, createElement, type FunctionComponent, type ReactNode, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ANSWER_TIMEOUT_MS, SHARE_WAIT_AFTER_IN_MS } from "@pinai/domain/models/approval-handshake"
import type { UserProfile } from "@pinai/domain/models/auth"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { IdpError } from "@pinai/domain/models/idp-error"
import {
    ApprovalAnswering,
    ApprovalAsking,
    type AnswerLock,
    type AskingState,
    type HandshakeDeps,
} from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { ApprovalDoor } from "@/presentation/organisms/ApprovalDoor/ApprovalDoor"
import {
    doorTitle,
    useApprovalDoorViewModel,
    type ApprovalDoorViewModel,
} from "@/presentation/organisms/ApprovalDoor/ApprovalDoor.viewmodel"
import {
    askingStatus,
    useApproveFromAnotherDeviceViewModel,
    type ApproveFromAnotherDeviceViewModel,
} from "@/presentation/pages/onboarding/RecoveryRestorePage/ApproveFromAnotherDevice/ApproveFromAnotherDevice.viewmodel"
import { useAppStore } from "@/store/store"

import { FakeAccount, type Clock } from "./setup/approval-relay"
import { ACTOR, FakeHistoryIdp, IDP, MemoryHistoryStorage, historyDevice } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"

const wired = vi.hoisted(() => ({
    deps: null as unknown as { e2ee: unknown; relay: unknown; directory: unknown },
    history: null as unknown,
    keyShares: { share: async () => undefined, waiting: async () => null } as unknown,
    handler: null as ((event: unknown) => void) | null,
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.deps.e2ee,
    getApprovalRelayPort: () => wired.deps.relay,
    getDeviceDirectoryPort: () => wired.deps.directory,
    getHistoryArchivePort: () => wired.history,
    getKeySharePort: () => wired.keyShares,
    getAuthPort: vi.fn(),
    getAuthPlatform: vi.fn(),
}))
vi.mock("@/presentation/hooks/useIdpWebSocket", () => ({
    registerApprovalHandler: (handler: (event: unknown) => void) => {
        wired.handler = handler
        return () => {
            if (wired.handler === handler) wired.handler = null
        }
    },
}))
vi.mock("sonner", () => ({ toast }))

const issuers = new FakeIssuers()
type Device = ReturnType<typeof historyDevice>

async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop", new MemoryHistoryStorage(), issuers.jwks)
    const outcome = await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    if (outcome.kind !== "holds") throw new Error("the first device didn't set the key")
    const phone = historyDevice(idp, "phone", new MemoryHistoryStorage(), issuers.jwks)
    const net = new FakeAccount(issuers)
    net.enrol(laptop, "Firefox on Linux")
    net.enrol(phone, "Chrome on Android")
    return { idp, laptop, phone, net }
}

const door = (net: FakeAccount, device: Device, options: { usedCodes?: Set<string>; lock?: AnswerLock; clock?: Clock } = {}) =>
    new ApprovalAnswering(net.deps(device), net.context(device, options.clock), options)

async function asking(net: FakeAccount, phone: Device) {
    const asker = new ApprovalAsking(net.deps(phone), net.context(phone))
    await asker.tick()
    return asker
}

const codeOf = (state: AskingState) => (state.kind === "showing" ? state.code : "")
const other = (code: string) => (code === "000000" ? "000001" : "000000")
const requested = (net: FakeAccount, phone: Device) =>
    ({
        type: "approval_requested",
        data: { request_id: net.last(), device_id: phone.storage.deviceId, display_name: "Chrome on Android" },
    }) as const

/** A lock shared by the tabs of one browser, as `navigator.locks` would hold it. */
function sharedLock(): AnswerLock {
    const held = new Set<string>()
    return async (requestId) => {
        if (held.has(requestId)) return null
        held.add(requestId)
        return () => held.delete(requestId)
    }
}

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("the Door's controller", () => {
    it("opens on load for another device's open request, on a device acting on approval", async () => {
        const { laptop, phone, net } = await account()
        await asking(net, phone)
        const prompt = door(net, laptop)

        await prompt.refresh()

        expect(prompt.snapshot()).toMatchObject({
            request: { deviceId: phone.storage.deviceId, displayName: "Chrome on Android" },
            stage: "entry",
            note: null,
            refused: null,
        })
    })

    it("never opens on a device that doesn't act on approval", async () => {
        const { idp, phone, net } = await account()
        const another = historyDevice(idp, "other", new MemoryHistoryStorage(), issuers.jwks)
        net.enrol(another, "Edge on Windows")
        await asking(net, phone)
        const prompt = door(net, another)

        await prompt.refresh()

        expect(prompt.snapshot()).toBeNull()
    })

    it("opens as `approval_requested` arrives", async () => {
        const { laptop, phone, net } = await account()
        const prompt = door(net, laptop)
        await prompt.refresh()
        expect(prompt.snapshot()).toBeNull()

        await asking(net, phone)
        await prompt.onPush(requested(net, phone))

        expect(prompt.snapshot()?.stage).toBe("entry")
    })

    it("drops an older read of the list that answers after a newer one", async () => {
        const { laptop, phone, net } = await account()
        await asking(net, phone)
        const read = net.relay.openRequests.bind(net.relay)
        let late!: () => void
        vi.spyOn(net.relay, "openRequests")
            .mockImplementationOnce(async (...args) => {
                const answer = await read(...args)
                await new Promise<void>((resolve) => (late = resolve))
                return answer
            })
            .mockImplementationOnce(async () => [])
        const prompt = door(net, laptop)

        const older = prompt.refresh()
        await vi.waitFor(() => expect(late).toBeDefined())
        await prompt.refresh()
        late()
        await older

        expect(prompt.snapshot()).toBeNull()
    })

    it("closes on `approval_closed` once another device answered, and drops a request taken under it", async () => {
        const { idp, laptop, phone, net } = await account()
        const tablet = historyDevice(idp, "tablet", new MemoryHistoryStorage(), issuers.jwks)
        net.enrol(tablet, "Safari on iPadOS")
        vi.spyOn(tablet.e2ee, "checkHistoryKey").mockResolvedValue({ kind: "holds", generation: 1, settled: true })
        const asker = await asking(net, phone)
        const onTablet = door(net, tablet)
        const late = door(net, tablet)
        const onLaptop = door(net, laptop)
        await Promise.all([onTablet.refresh(), late.refresh(), onLaptop.refresh()])

        await onLaptop.answer(codeOf(asker.state))
        const told = net.pushes.find((p) => p.type === "approval_closed" && p.to.includes(tablet.storage.deviceId))
        await onTablet.onPush({ type: "approval_closed", data: { request_id: told!.requestId } })
        expect(onTablet.snapshot()).toBeNull()
        expect(onLaptop.snapshot()?.stage).toBe("working")

        // A tab that missed the push answers, is told it's taken, and lets the request go.
        await late.answer(codeOf(asker.state))
        expect(late.snapshot()).toBeNull()
    })

    it("leaves an unanswered request alone when closed, and ends one it took part in", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const prompt = door(net, laptop)
        await prompt.refresh()

        await prompt.dismiss()
        await prompt.refresh()
        expect(prompt.snapshot()).toBeNull()
        expect(net.isOpen(net.last())).toBe(true)

        const again = door(net, laptop)
        await again.refresh()
        await again.answer(codeOf(asker.state))
        expect(again.snapshot()?.stage).toBe("working")
        await again.dismiss()
        expect(net.isOpen(net.last())).toBe(false)
    })

    it("ends the request when the user cancels the exchange", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const prompt = door(net, laptop)
        await prompt.refresh()
        await prompt.answer(codeOf(asker.state))

        await prompt.cancel()

        expect(prompt.snapshot()).toBeNull()
        expect(net.isOpen(net.last())).toBe(false)
    })

    it("gives up an exchange that runs past its time", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const clock = { at: net.now.at }
        const prompt = door(net, laptop, { clock })
        await prompt.refresh()
        await prompt.answer(codeOf(asker.state))

        clock.at += ANSWER_TIMEOUT_MS
        await prompt.poll()

        expect(prompt.snapshot()).toMatchObject({ stage: "failed", failure: "expired" })
        expect(net.isOpen(net.last())).toBe(false)
    })

    it("says a wrong code ended the request, opens for the next one with a note, and never tries that code again", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const usedCodes = new Set<string>()
        const prompt = door(net, laptop, { usedCodes })
        await prompt.refresh()
        const first = net.last()
        const wrong = other(codeOf(asker.state))

        await prompt.answer(wrong)
        await asker.tick()
        await prompt.poll()
        expect(prompt.snapshot()).toMatchObject({ stage: "failed", failure: "wrong-code" })

        await asker.tick()
        await asker.again()
        await prompt.onPush(requested(net, phone))
        expect(prompt.snapshot()).toMatchObject({ stage: "entry", note: "wrong-code", failure: null })
        expect(prompt.snapshot()?.request.id).not.toBe(first)

        const posted = net.calls.length
        await prompt.answer(wrong)
        expect(prompt.snapshot()).toMatchObject({ stage: "entry", refused: "used-code" })
        expect(net.calls.length).toBe(posted)
    })

    it("lets one tab answer a request, and never offers again one this device answered", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const lock = sharedLock()
        const tabA = door(net, laptop, { lock })
        const tabB = door(net, laptop, { lock })
        await Promise.all([tabA.refresh(), tabB.refresh()])

        await tabA.answer(codeOf(asker.state))
        await tabB.answer(codeOf(asker.state))

        expect(tabA.snapshot()?.stage).toBe("working")
        expect(tabB.snapshot()).toMatchObject({ stage: "entry", refused: "other-tab" })

        const reloaded = door(net, laptop)
        await reloaded.refresh()
        expect(reloaded.snapshot()).toBeNull()
    })

    it("says why it doesn't approve when this device turns out not to act", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const prompt = door(net, laptop)
        await prompt.refresh()
        vi.spyOn(laptop.e2ee, "checkHistoryKey").mockResolvedValue({ kind: "no-passphrase", generation: 1 })

        await prompt.answer(codeOf(asker.state))

        expect(prompt.snapshot()).toMatchObject({ stage: "failed", failure: "not-acting" })
        await prompt.dismiss()
        await asker.again()
        await prompt.onPush(requested(net, phone))
        expect(prompt.snapshot()).toBeNull()
    })

    it("approves with the code typed, and says so", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const prompt = door(net, laptop)
        await prompt.refresh()

        await prompt.answer(codeOf(asker.state))
        for (let i = 0; i < 6 && prompt.snapshot()?.stage !== "approved"; i++) {
            await asker.tick()
            await prompt.poll()
        }
        await asker.tick()

        expect(prompt.snapshot()?.stage).toBe("approved")
        expect(asker.state.kind).toBe("approved")
        expect(doorTitle(prompt.snapshot())).toBe("Approved")
    })
})

let root: Root | null = null
let container: HTMLElement

function providers(children: ReactNode, strict = false) {
    const tree = createElement(QueryClientProvider, { client: new QueryClient() }, children)
    return strict ? createElement(StrictMode, null, tree) : tree
}

async function render(component: FunctionComponent, strict = false): Promise<void> {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root?.render(providers(createElement(component), strict))
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

async function until(check: () => boolean, step = 50) {
    for (let i = 0; i < 400 && !check(); i++) await advance(step)
    expect(check()).toBe(true)
}

function signIn(device: Device, deps: HandshakeDeps) {
    wired.deps = deps
    useAppStore.setState({
        idpUrl: IDP,
        accessToken: device.token,
        user: { actor_uri: ACTOR } as UserProfile,
        wsStatus: "connected",
    })
}

describe("the Door's view model", () => {
    let vm!: ApprovalDoorViewModel

    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
        toast.success.mockReset()
        toast.error.mockReset()
    })

    afterEach(async () => {
        await unmount()
        vi.useRealTimers()
    })

    function Door() {
        const rendered = useApprovalDoorViewModel()
        useEffect(() => {
            vm = rendered
        })
        return null
    }

    it("names the device asking and when it asked, and takes six digits, pasted or typed", async () => {
        const { laptop, phone, net } = await account()
        await asking(net, phone)
        signIn(laptop, net.deps(laptop))

        await render(Door)
        await until(() => vm?.view?.stage === "entry")
        expect(vm.asked).toBe("asked just now · idp.test")
        await advance(120_000)

        expect(vm.device).toBe("Chrome on Android")
        expect(vm.asked).toBe("asked 2 minutes ago · idp.test")
        expect(vm.title).toBe("Is this you?")
        expect(vm.canApprove).toBe(false)

        await act(async () => vm.setCode("482 91"))
        expect(vm.code).toBe("48291")
        await act(async () => vm.setCode("482-913-0"))
        expect(vm.code).toBe("482913")
        expect(vm.canApprove).toBe(true)

        await act(async () => vm.onClose())
        await until(() => vm.view === null)
        expect(net.isOpen(net.last())).toBe(true)
    })

    it("hears the relay's pushes, reads the list again when the socket comes back, and retries a failed read", async () => {
        const { laptop, phone, net } = await account()
        signIn(laptop, net.deps(laptop))
        net.failNext("openRequests", new Error("offline"))
        await render(Door)
        await until(() => wired.handler !== null)

        await asking(net, phone)
        await advance(6_000)
        await until(() => vm?.view?.stage === "entry")

        await act(async () => wired.handler?.({ type: "approval_closed", data: { request_id: net.last() } }))
        await until(() => vm.view === null)

        // A request opened while the socket was down is found once it reconnects.
        await act(async () => useAppStore.setState({ wsStatus: "disconnected" }))
        const asker = new ApprovalAsking(net.deps(phone), net.context(phone))
        await asker.again()
        await act(async () => useAppStore.setState({ wsStatus: "connected" }))
        await until(() => vm.view?.request.id === net.last())
    })

    it("polls the exchange while it works, through to the approval", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        signIn(laptop, net.deps(laptop))
        await render(Door)
        await until(() => vm?.view?.stage === "entry")

        await act(async () => vm.setCode(codeOf(asker.state)))
        await act(async () => vm.onApprove())
        await until(() => vm.view?.stage === "working")

        for (let i = 0; i < 6 && vm.view?.stage !== "approved"; i++) {
            await act(async () => asker.tick())
            await advance(3_000)
        }
        expect(vm.view?.stage).toBe("approved")
        expect(vm.title).toBe("Approved")
    })

    it("signs the device out with “Not me”, and asks the password again when the IdP does", async () => {
        const { laptop, phone, net } = await account()
        await asking(net, phone)
        const markRevoked = vi.spyOn(net.directory, "markRevoked")
        markRevoked.mockRejectedValueOnce(new IdpError(401, "insufficient_user_authentication", "Sign in again"))
        // Its MLS Remove commits are the revoke flow's own business, covered beside it.
        const removed = vi.spyOn(laptop.e2ee, "revokeDevice").mockResolvedValue({ removed_from: [] })
        signIn(laptop, net.deps(laptop))
        await render(Door)
        await until(() => vm?.view?.stage === "entry")

        await act(async () => vm.onNotMe())
        await until(() => vm.recentSignIn.asking !== null)
        expect(vm.recentSignIn.asking).toBe("sign that device out")
        expect(vm.view?.stage).toBe("entry")

        await act(async () => vm.onNotMe())
        await until(() => vm.view === null)
        expect(markRevoked).toHaveBeenLastCalledWith(IDP, laptop.token, phone.storage.deviceId)
        expect(removed).toHaveBeenCalledWith(IDP, laptop.token, ACTOR, phone.storage.deviceId, [])
        expect(net.rows.get(phone.storage.deviceId)?.revoked_at).not.toBeNull()
        expect(toast.success).toHaveBeenCalledWith("Chrome on Android is signed out")
    })

    it("can't be escaped while it works, and Cancel ends the request", async () => {
        // jsdom has no `CSS.escape`, which React Aria's modal reads.
        if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        signIn(laptop, net.deps(laptop))
        const seen: { vm?: ApprovalDoorViewModel } = {}
        function Probe() {
            const rendered = useApprovalDoorViewModel()
            useEffect(() => {
                seen.vm = rendered
            })
            return null
        }
        await render(() => createElement("div", null, createElement(ApprovalDoor), createElement(Probe)))
        const dialog = () => document.body.querySelector('[role="dialog"]')
        await until(() => dialog() !== null && document.body.textContent?.includes("Chrome on Android") === true)

        const cells = [...document.body.querySelectorAll<HTMLInputElement>('[role="dialog"] input[inputmode="numeric"]')]
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
        await act(async () => {
            setValue.call(cells[0], codeOf(asker.state))
            cells[0].dispatchEvent(new Event("input", { bubbles: true }))
        })
        const approve = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Approve")!
        await act(async () => approve.click())
        await until(() => document.body.textContent?.includes("Approving…") === true)

        await act(async () => {
            dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        })
        await advance(100)
        expect(dialog()).not.toBeNull()
        expect(net.isOpen(net.last())).toBe(true)

        const cancel = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!
        await act(async () => cancel.click())
        await until(() => !net.isOpen(net.last()))
        vi.unstubAllGlobals()
    })
})

describe("the asking section's view model", () => {
    let vm!: ApproveFromAnotherDeviceViewModel
    let active = true

    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
        active = true
    })

    afterEach(async () => {
        await unmount()
        vi.useRealTimers()
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false })
    })

    function Section() {
        const rendered = useApproveFromAnotherDeviceViewModel({ ready: true, active, fallbackLabel: "Web client" })
        useEffect(() => {
            vm = rendered
        })
        return null
    }

    const openOnes = (net: FakeAccount) => [...net.requests.keys()].filter((id) => net.isOpen(id))

    it("shows the code as 3 + 3, when the next comes, this device and the others to approve from; one request under StrictMode, ended when it goes", async () => {
        const { idp, phone, net } = await account()
        const gone = historyDevice(idp, "gone", new MemoryHistoryStorage(), issuers.jwks)
        const row = net.enrol(gone, "Old tablet")
        net.list({ ...row, revoked_at: "2026-11-01T00:00:00Z" } as DeviceListEntry)
        signIn(phone, net.deps(phone))

        await render(Section, true)
        await until(() => vm?.halves !== null && vm.thisDevice === "Chrome on Android")

        const code = codeOf(vm.state)
        expect(vm.halves).toEqual([code.slice(0, 3), code.slice(3)])
        expect(vm.nextCode).toBe("new in 10 min")
        expect(vm.ringFraction).toBeGreaterThan(0.99)
        expect(vm.approvers.map((d) => d.label)).toEqual(["Firefox on Linux"])
        expect(vm.status).toBeNull()
        expect(vm.action).toBeNull()
        expect(openOnes(net)).toHaveLength(1)
        expect(net.requests.size).toBe(1)

        const requestId = net.last()
        await unmount()
        await advance(100)
        expect(net.isOpen(requestId)).toBe(false)
    })

    it("ends its request as the page goes, with a request that outlives it", async () => {
        const { phone, net } = await account()
        signIn(phone, net.deps(phone))
        const close = vi.spyOn(net.relay, "close")
        await render(Section)
        await until(() => vm?.halves !== null)

        await act(async () => window.dispatchEvent(new Event("pagehide")))
        await advance(100)

        expect(close).toHaveBeenCalledWith(IDP, phone.token, net.last(), { keepalive: true })
        expect(net.isOpen(net.last())).toBe(false)
    })

    it("asks nothing while another tab is open; its tab opening opens a request, leaving it ends it, coming back opens another", async () => {
        const { phone, net } = await account()
        signIn(phone, net.deps(phone))
        active = false
        await render(Section)
        await advance(30_000)
        expect(net.requests.size).toBe(0)

        active = true
        await act(async () => root?.render(providers(createElement(Section))))
        await until(() => vm.halves !== null)
        const first = net.last()

        active = false
        await act(async () => root?.render(providers(createElement(Section))))
        await until(() => vm.state.kind === "paused")
        expect(net.isOpen(first)).toBe(false)
        expect(vm.halves).toBeNull()
        await advance(60_000)
        expect(net.requests.size).toBe(1)

        active = true
        await act(async () => root?.render(providers(createElement(Section))))
        await until(() => vm.halves !== null)
        expect(net.last()).not.toBe(first)
        expect(openOnes(net)).toEqual([net.last()])
    })

    it("waits for “New code” after a code someone answered, and reads nothing while the page is hidden", async () => {
        const { laptop, phone, net } = await account()
        signIn(phone, net.deps(phone))
        await render(Section)
        await until(() => vm?.halves !== null)

        await net.relay.close(IDP, laptop.token, net.last())
        await until(() => vm.action === "new-code")
        expect(vm.status).toBe("That request ended without approving this device.")

        Object.defineProperty(document, "hidden", { configurable: true, get: () => true })
        await act(async () => vm.onAction())
        await until(() => vm.halves !== null)
        const reads = net.calls.length
        await advance(30_000)
        expect(net.calls.length).toBe(reads)

        Object.defineProperty(document, "hidden", { configurable: true, get: () => false })
        await act(async () => document.dispatchEvent(new Event("visibilitychange")))
        await advance(10)
        expect(net.calls.length).toBeGreaterThan(reads)
    })

    /** The phone's section on screen, `entered` told once it is in; the laptop answers its code. */
    async function approvedPhone() {
        const accounts = await account()
        const { idp, laptop, phone, net } = accounts
        wired.history = idp
        signIn(phone, net.deps(phone))
        const entered = vi.fn()
        function Entering() {
            const rendered = useApproveFromAnotherDeviceViewModel({ ready: true, active: true, fallbackLabel: "Web client", onIn: entered })
            useEffect(() => {
                vm = rendered
            })
            return null
        }
        await render(Entering)
        await until(() => vm?.halves !== null)
        idp.log.length = 0
        const prompt = door(net, laptop)
        await prompt.refresh()
        await prompt.answer(codeOf(vm.state))
        for (let i = 0; i < 8 && vm.state.kind !== "approved"; i++) {
            await prompt.poll()
            await advance(3_000)
        }
        expect(vm.state.kind).toBe("approved")
        const reads = () => net.calls.filter((call) => call === `listDevices:${phone.storage.deviceId}`).length
        // The laptop's row as the instance lists it before its report: not yet at the current generation.
        const laptopRow = net.rows.get(laptop.storage.deviceId) as DeviceListEntry
        const reported = () => net.list({ ...laptopRow, history_generation: 1, approvals: [...laptopRow.approvals] })
        return { ...accounts, entered, reads, reported }
    }

    it("once approved, publishes its KeyPackages once the list shows it in, and with no key share goes on after a minute — then reads the list no more", async () => {
        const { idp, entered, reads, reported } = await approvedPhone()

        await advance(100)
        expect(entered).not.toHaveBeenCalled()
        expect(idp.log).not.toContain("key packages")
        expect(vm.status).toBe("Approved — bringing your history…")

        await advance(35_000)
        expect(vm.status).toBe("Approved. Waiting for your other device to finish: it hasn't yet said it holds your history passphrase.")

        reported()
        await until(() => idp.log.includes("key packages"), 500)
        await advance(SHARE_WAIT_AFTER_IN_MS - 31_000)
        expect(entered).not.toHaveBeenCalled()
        await until(() => entered.mock.calls.length === 1, 500)
        expect(idp.log.filter((line) => line === "key packages")).toHaveLength(1)

        const after = reads()
        await advance(30_000)
        expect(reads()).toBe(after)
        expect(entered).toHaveBeenCalledOnce()
    })

    it("reads nothing more once the section goes, mid-wait", async () => {
        const { entered, reads } = await approvedPhone()
        await advance(100)

        await unmount()
        const after = reads()
        await advance(5 * 60_000)

        expect(reads()).toBe(after)
        expect(entered).not.toHaveBeenCalled()
    })

    it("words what is happening", () => {
        const showing = { kind: "showing", code: "482913", deadline: 0, answered: false, failure: null } as const
        expect(askingStatus({ kind: "starting" })).toBe("Asking your instance for a code…")
        expect(askingStatus({ ...showing, phase: "waiting" })).toBeNull()
        expect(askingStatus({ ...showing, phase: "confirming", answered: true })).toBe("Your other device is checking the code…")
        expect(askingStatus({ kind: "stopped", failure: "wrong-code" })).toBe("That code didn't match on your other device.")
        expect(askingStatus({ kind: "waiting", until: 0, why: "unreachable", failure: null })).toBe("Couldn't reach your instance. Trying again…")
        expect(askingStatus({ kind: "waiting", until: Date.parse("2026-11-04T12:30:00"), why: "limit", failure: null })).toMatch(
            /^Too many codes asked for this hour\. A new one at 12:30/,
        )
    })
})
