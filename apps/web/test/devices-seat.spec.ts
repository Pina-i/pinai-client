/**
 * Settings → Devices' waiting seats (`identity-provider/specs/e2ee.md § 3.10`), over real E2EE
 * engines and a relay keeping the IdP's rules. While the pane is up the Door starts nothing: each
 * request waits in its seat, answered inline through the Door's own answering side — its run, the
 * codes it tried, its lock, its poll and timeout —, the Door's set-aside included; one exchange at a
 * time, a failed answer tried again, a wrong code's next request back in the seat with its note.
 * Once the pane goes, an exchange under way goes on at the Door, and a request settled here never
 * comes back. "Not mine" revokes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter, type AnyRouter } from "@tanstack/react-router"
import { StrictMode, act, createElement, useEffect, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ANSWER_TIMEOUT_MS } from "@pinai/domain/models/approval-handshake"
import type { UserProfile } from "@pinai/domain/models/auth"
import {
    ApprovalAnswering,
    ApprovalAsking,
    type AnswerLock,
    type AskingState,
} from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { useApprovalAnsweringRuntime } from "@/presentation/hooks/use-approval-answering"
import { DevicesEditor } from "@/presentation/pages/home/SettingsModal/DevicesEditor/DevicesEditor"
import { useSettingsModalViewModel } from "@/presentation/pages/home/SettingsModal/SettingsModal.viewmodel"
import { useAppStore } from "@/store/store"

import { FakeAccount, type Clock } from "./setup/approval-relay"
import { ACTOR, FakeHistoryIdp, IDP, MemoryHistoryStorage, historyDevice } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"

const wired = vi.hoisted(() => ({
    e2ee: null as unknown,
    relay: null as unknown,
    directory: null as unknown,
    history: null as unknown,
    handler: null as ((event: unknown) => void) | null,
}))
vi.mock("@/ioc", () => ({
    getE2eePort: () => wired.e2ee,
    getApprovalRelayPort: () => wired.relay,
    getDeviceDirectoryPort: () => wired.directory,
    getHistoryArchivePort: () => wired.history,
    getKeySharePort: () => ({ share: async () => undefined, waiting: async () => null }),
    getSessionPort: vi.fn(),
    getNodeInfoPort: vi.fn(),
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))
vi.mock("@/presentation/molecules/RecentSignInModal/RecentSignInModal", () => ({
    RecentSignInModal: ({ action }: { action: string | null }) => (action ? `To ${action}, sign in again` : null),
}))

const issuers = new FakeIssuers()
type Device = ReturnType<typeof historyDevice>

/** A laptop holding generation 1, and a phone and a tablet signed in that nobody approved. */
async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop", new MemoryHistoryStorage(), issuers.jwks)
    const outcome = await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    if (outcome.kind !== "holds") throw new Error("the first device didn't set the key")
    const phone = historyDevice(idp, "phone", new MemoryHistoryStorage(), issuers.jwks)
    const tablet = historyDevice(idp, "tablet", new MemoryHistoryStorage(), issuers.jwks)
    const net = new FakeAccount(issuers)
    net.enrol(laptop, "Firefox on Linux")
    net.enrol(phone, "Chrome on Android")
    net.enrol(tablet, "Safari on iPadOS")
    return { idp, laptop, phone, tablet, net }
}

const answering = (net: FakeAccount, device: Device, options: { usedCodes?: Set<string>; lock?: AnswerLock; clock?: Clock } = {}) =>
    new ApprovalAnswering(net.deps(device), net.context(device, options.clock), options)

async function asking(net: FakeAccount, device: Device) {
    const asker = new ApprovalAsking(net.deps(device), net.context(device))
    await asker.tick()
    return asker
}

const codeOf = (state: AskingState) => (state.kind === "showing" ? state.code : "")
const other = (code: string) => (code === "000000" ? "000001" : "000000")
const requested = (net: FakeAccount, device: Device) =>
    ({
        type: "approval_requested",
        data: { request_id: net.last(), device_id: device.storage.deviceId, display_name: "" },
    }) as const

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
    vi.restoreAllMocks()
})

/** Steps the asker and the answering side until `done`. */
async function exchange(asker: ApprovalAsking, shared: ApprovalAnswering, done: () => boolean) {
    for (let i = 0; i < 8 && !done(); i++) {
        await asker.tick()
        await shared.poll()
    }
}

describe("a seat's answering, the Door's own", () => {
    it("answers inline while the pane is up: a request arriving waits in its seat, the Door starting nothing", async () => {
        const { laptop, phone, net } = await account()
        const shared = answering(net, laptop)
        await shared.refresh()
        shared.showSeats()

        const asker = await asking(net, phone)
        await shared.onPush(requested(net, phone))
        expect(shared.snapshot()).toBeNull()
        expect(shared.seats()).toMatchObject({ open: [{ id: net.last() }], atDoor: null, seat: null, busy: false })

        await shared.answerAt(net.last(), codeOf(asker.state))
        expect(shared.seats()).toMatchObject({ seat: { stage: "working" }, busy: true })
        await exchange(asker, shared, () => shared.seats().seat?.stage === "approved")
        await asker.tick()

        expect(shared.snapshot()).toBeNull()
        expect(shared.seats().seat?.stage).toBe("approved")
        expect(asker.state.kind).toBe("approved")
        expect(net.approvals).toContainEqual({ approver: laptop.storage.deviceId, approved: phone.storage.deviceId })
    })

    it("takes in its seat a request the Door held unanswered as the pane opens, or one it set aside", async () => {
        const { laptop, phone, net } = await account()
        await asking(net, phone)
        const shared = answering(net, laptop)
        await shared.refresh()
        expect(shared.snapshot()?.stage).toBe("entry")

        shared.showSeats()
        expect(shared.snapshot()).toBeNull()
        expect(shared.seats().seat).toMatchObject({ stage: "entry", request: { id: net.last() } })

        shared.leaveSeat()
        await shared.dismiss()
        expect(shared.seats()).toMatchObject({ open: [{ id: net.last() }], seat: null })
    })

    it("holds every other seat while one exchange runs, then answers the next", async () => {
        const { laptop, phone, tablet, net } = await account()
        const onPhone = await asking(net, phone)
        const phoneRequest = net.last()
        const onTablet = await asking(net, tablet)
        const tabletRequest = net.last()
        const shared = answering(net, laptop)
        await shared.refresh()
        shared.showSeats()
        expect(shared.seats().open.map((r) => r.id).sort()).toEqual([phoneRequest, tabletRequest].sort())

        await shared.answerAt(phoneRequest, codeOf(onPhone.state))
        const posted = net.calls.length
        await shared.answerAt(tabletRequest, codeOf(onTablet.state))
        expect(shared.seats().seat?.request.id).toBe(phoneRequest)
        expect(net.calls.filter((c) => c.startsWith("post:")).length).toBe(
            net.calls.slice(0, posted).filter((c) => c.startsWith("post:")).length,
        )

        await exchange(onPhone, shared, () => shared.seats().seat?.stage === "approved")
        expect(shared.seats().busy).toBe(false)
        await shared.answerAt(tabletRequest, codeOf(onTablet.state))
        await exchange(onTablet, shared, () => shared.seats().seat?.stage === "approved")
        expect(shared.seats().seat).toMatchObject({ stage: "approved", request: { id: tabletRequest } })
    })

    it("tries a failed answer again — the instance out of reach once —, holding no seat meanwhile", async () => {
        const { idp, laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const held = new Set<string>()
        const lock: AnswerLock = async (id) => (held.has(id) ? null : (held.add(id), () => held.delete(id)))
        const shared = answering(net, laptop, { lock })
        await shared.refresh()
        shared.showSeats()
        vi.spyOn(idp, "getKey").mockRejectedValueOnce(new TypeError("Failed to fetch"))

        await expect(shared.answerAt(net.last(), codeOf(asker.state))).rejects.toThrow("Failed to fetch")
        expect(shared.seats()).toMatchObject({ seat: { stage: "entry", refused: null }, busy: false })
        expect(held.size).toBe(0)

        await shared.answerAt(net.last(), codeOf(asker.state))
        expect(shared.seats().seat?.stage).toBe("working")
    })

    it("never answers while the Door shows a request, and never tries a code the Door tried", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const usedCodes = new Set<string>()
        const shared = answering(net, laptop, { usedCodes })
        await shared.refresh()
        expect(shared.seats().busy).toBe(true)

        const posted = net.calls.length
        await shared.answerAt(net.last(), codeOf(asker.state))
        expect(net.calls.length).toBe(posted)
        expect(shared.snapshot()?.stage).toBe("entry")

        const wrong = other(codeOf(asker.state))
        await shared.answer(wrong)
        await asker.tick()
        await shared.poll()
        expect(shared.snapshot()).toMatchObject({ stage: "failed", failure: "wrong-code" })
        await asker.tick()
        await asker.again()
        await shared.refresh()
        await shared.dismiss()

        const before = net.calls.length
        await shared.answerAt(net.last(), wrong)
        expect(shared.seats().seat).toMatchObject({ stage: "entry", refused: "used-code" })
        expect(net.calls.length).toBe(before)
    })

    it("keeps a wrong code's next request in the seat with its note, and never brings an approved one back at the Door", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const shared = answering(net, laptop)
        await shared.refresh()
        shared.showSeats()

        await shared.answerAt(net.last(), other(codeOf(asker.state)))
        await exchange(asker, shared, () => shared.seats().seat?.stage === "failed")
        expect(shared.seats().seat).toMatchObject({ stage: "failed", failure: "wrong-code" })
        await asker.tick()
        await asker.again()
        await shared.refresh()
        expect(shared.seats().seat).toMatchObject({ stage: "entry", note: "wrong-code", request: { id: net.last() } })
        expect(shared.snapshot()).toBeNull()

        await shared.answerAt(net.last(), codeOf(asker.state))
        await exchange(asker, shared, () => shared.seats().seat?.stage === "approved")
        shared.leaveSeat()
        await shared.refresh()
        expect(shared.snapshot()).toBeNull()
    })

    it("lets one tab answer: a seat in another tab is refused while this one's exchange runs", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const held = new Set<string>()
        const lock: AnswerLock = async (id) => (held.has(id) ? null : (held.add(id), () => held.delete(id)))
        const tabA = answering(net, laptop, { lock })
        const tabB = answering(net, laptop, { lock })
        await Promise.all([tabA.refresh(), tabB.refresh()])
        tabA.showSeats()
        tabB.showSeats()

        await tabA.answerAt(net.last(), codeOf(asker.state))
        await tabB.answerAt(net.last(), codeOf(asker.state))

        expect(tabA.seats().seat?.stage).toBe("working")
        expect(tabB.seats().seat).toMatchObject({ stage: "entry", refused: "other-tab" })
    })

    it("gives up a seat's exchange past its time; Cancel ends the request, the Door starting nothing after", async () => {
        const { laptop, phone, tablet, net } = await account()
        const asker = await asking(net, phone)
        await asking(net, tablet)
        const clock = { at: net.now.at }
        const shared = answering(net, laptop, { clock })
        await shared.refresh()
        shared.showSeats()
        const phoneRequest = shared.seats().open.find((r) => r.deviceId === phone.storage.deviceId)!.id
        await shared.answerAt(phoneRequest, codeOf(asker.state))

        clock.at += ANSWER_TIMEOUT_MS
        await shared.poll()
        expect(shared.seats().seat).toMatchObject({ stage: "failed", failure: "expired" })
        expect(net.isOpen(phoneRequest)).toBe(false)

        await asker.tick()
        await asker.again()
        await shared.refresh()
        const again = shared.seats().open.find((r) => r.deviceId === phone.storage.deviceId)!.id
        await shared.answerAt(again, codeOf(asker.state))
        await shared.cancel()
        expect(net.isOpen(again)).toBe(false)
        expect(shared.snapshot()).toBeNull()
        expect(shared.seats().open.map((r) => r.deviceId)).toEqual([tablet.storage.deviceId])
    })

    it("hands an exchange under way to the Door when the pane goes, but never a request it set aside", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        const shared = answering(net, laptop)
        await shared.refresh()
        await shared.answer(other(codeOf(asker.state)))
        await asker.tick()
        await shared.poll()
        await asker.tick()
        await asker.again()
        await shared.refresh()
        await shared.dismiss()

        shared.showSeats()
        await shared.answerAt(net.last(), other(codeOf(asker.state)))
        shared.leaveSeat()
        expect(shared.snapshot()).toBeNull()

        shared.showSeats()
        await shared.answerAt(net.last(), codeOf(asker.state))
        shared.leaveSeat()
        expect(shared.seats().seat).toBeNull()
        expect(shared.snapshot()?.stage).toBe("working")
        expect(shared.seats().atDoor?.id).toBe(net.last())
    })

    it("takes no code on a device holding the words but not yet settled, and says so", async () => {
        const { laptop, phone, net } = await account()
        const asker = await asking(net, phone)
        vi.spyOn(laptop.e2ee, "checkHistoryKey").mockResolvedValue({ kind: "holds", generation: 1, settled: false })
        const shared = answering(net, laptop)
        await shared.refresh()
        shared.showSeats()

        expect(shared.seats()).toMatchObject({ open: [{ id: net.last() }], unsettled: true })
        const posted = net.calls.length
        await shared.answerAt(net.last(), codeOf(asker.state))
        expect(net.calls.length).toBe(posted)
        expect(shared.seats().seat).toBeNull()
    })
})

let root: Root | null = null
let container: HTMLElement
let runtime: ApprovalAnswering | null = null
let closePane: (() => void) | null = null
let settingsAnswering: boolean | null = null
let settingsSection: string | null = null
let waitingOnTile: number | null = null
let paneRouter: AnyRouter | null = null

function Runtime() {
    const made = useApprovalAnsweringRuntime()
    useEffect(() => {
        runtime = made
    })
    return null
}

/** Whether Settings lets Escape close it. */
function Settings() {
    const { isAnswering, shownSection, waitingCount } = useSettingsModalViewModel()
    useEffect(() => {
        settingsAnswering = isAnswering
        settingsSection = shownSection
        waitingOnTile = waitingCount
    })
    return null
}

/** The Door's runtime stays as Settings → Devices comes and goes, as `_authenticated` keeps it. */
function Pane() {
    const [open, setOpen] = useState(true)
    useEffect(() => {
        closePane = () => setOpen(false)
    })
    return createElement("div", null, createElement(Runtime), createElement(Settings), open ? createElement(DevicesEditor) : null)
}

async function render(strict = false): Promise<void> {
    const router = createRouter({
        routeTree: createRootRoute({ component: Pane }),
        history: createMemoryHistory({ initialEntries: ["/home"] }),
    })
    paneRouter = router
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const tree = createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router }))
    await act(async () => {
        root?.render(strict ? createElement(StrictMode, null, tree) : tree)
    })
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

const seatOf = (deviceId: string) => container.querySelector(`[data-seat="${deviceId}"]`)
const buttonIn = (element: Element | null, label: string) =>
    [...(element?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === label)

async function typeCode(seat: Element | null, code: string) {
    const cells = [...(seat?.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]') ?? [])]
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => {
        setValue.call(cells[0], code)
        cells[0].dispatchEvent(new Event("input", { bubbles: true }))
    })
}

describe("the waiting seats on screen", () => {
    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
        runtime = null
    })

    afterEach(async () => {
        if (root) {
            const leaving = root
            root = null
            await act(async () => leaving.unmount())
            container.remove()
        }
        vi.useRealTimers()
    })

    /** The laptop signed in, its review of the list standing: the phone and the tablet wait. */
    async function signedIn() {
        return signedInAs(await account())
    }

    async function signedInAs(accounts: Awaited<ReturnType<typeof account>>) {
        const { idp, laptop, net } = accounts
        wired.e2ee = laptop.e2ee
        wired.relay = net.relay
        wired.directory = net.directory
        wired.history = idp
        useAppStore.setState({
            idpUrl: IDP,
            accessToken: laptop.token,
            user: { actor_uri: ACTOR } as UserProfile,
            localDmConvos: [],
            wsStatus: "connected",
        })
        await laptop.e2ee.reviewDevices(IDP, laptop.token, ACTOR, (await net.directory.listDevices(IDP, laptop.token)).devices)
        return accounts
    }

    const codeField = (device: Device) => seatOf(device.storage.deviceId)?.querySelector("input") ?? null

    /** Types the code in `device`'s seat and presses Approve. */
    async function approveIn(device: Device, code: string) {
        await typeCode(seatOf(device.storage.deviceId), code)
        await act(async () => buttonIn(seatOf(device.storage.deviceId), "Approve")?.click())
    }

    it("offers the code inline for an open request — the Door starting nothing —, and none to a device that asks nothing", async () => {
        const { phone, tablet, net } = await signedIn()
        await asking(net, phone)
        await render()
        await until(() => codeField(phone) !== null)

        expect(runtime?.snapshot()).toBeNull()
        expect(container.textContent).toContain("2 waiting")
        expect(container.querySelector("p.sr-only[role=status]")?.textContent).toBe("2 waiting for you: Chrome on Android, Safari on iPadOS")
        const seat = seatOf(phone.storage.deviceId)
        expect(seat?.textContent).toContain("Type the code Chrome on Android shows")
        expect(seat?.textContent).toContain("a wrong code ends the request")
        expect(seat?.textContent).toContain("asked just now")
        expect(seat?.textContent).not.toContain("Being answered")
        expect(buttonIn(seat, "Approve")?.disabled).toBe(true)
        expect(seatOf(tablet.storage.deviceId)?.textContent).toContain("waiting for you")
        expect(seatOf(tablet.storage.deviceId)?.textContent).toContain("reads nothing of yours until you approve it")
        expect(seatOf(tablet.storage.deviceId)?.textContent).toMatch(/paired \S+/)
        expect(codeField(tablet)).toBeNull()
    })

    it("seats a device from before this device started over apart — counted nowhere —, its code inline when it asks, through the same run", async () => {
        const accounts = await account()
        const { laptop, phone, tablet, net } = accounts
        laptop.storage.trust = {
            ...laptop.storage.trust,
            before: [{ generation: 1, cause: "start-over", devices: [{ deviceId: phone.storage.deviceId, rootKey: phone.storage.rootKey.publicKey }], refused: [] }],
        }
        await signedInAs(accounts)
        const asker = await asking(net, phone)
        await render()
        await until(() => codeField(phone) !== null)

        expect(container.textContent).toContain("From before you started over")
        expect(container.textContent).toContain("1 waiting")
        const seat = seatOf(phone.storage.deviceId)
        expect(seat?.textContent).toContain("Type the code Chrome on Android shows")
        expect(seat?.textContent).not.toContain("waiting for you")
        expect(buttonIn(seat, "Sign out")?.getAttribute("aria-label")).toBe("Sign out Chrome on Android")
        expect(buttonIn(seat, "Not mine")).toBeUndefined()
        expect(seatOf(tablet.storage.deviceId)?.textContent).toContain("waiting for you")

        await approveIn(phone, codeOf(asker.state))
        for (let i = 0; i < 8 && runtime?.seats().seat?.stage !== "approved"; i++) {
            await act(async () => asker.tick())
            await advance(3_000)
        }
        await until(() => seatOf(phone.storage.deviceId)?.textContent?.includes("Chrome on Android is one of your devices now.") === true)
        expect(net.approvals).toContainEqual({ approver: laptop.storage.deviceId, approved: phone.storage.deviceId })
    })

    it("titles them for a replacement: “From before you replaced your words”, still counted nowhere", async () => {
        const accounts = await account()
        const { laptop, phone } = accounts
        laptop.storage.trust = {
            ...laptop.storage.trust,
            before: [{ generation: 1, cause: "replacement", devices: [{ deviceId: phone.storage.deviceId, rootKey: phone.storage.rootKey.publicKey }], refused: [] }],
        }
        await signedInAs(accounts)
        await render()
        await until(() => seatOf(phone.storage.deviceId) !== null)

        expect(container.textContent).toContain("From before you replaced your words")
        expect(container.textContent).not.toContain("From before you started over")
        expect(container.textContent).toContain("1 waiting")
        expect(seatOf(phone.storage.deviceId)?.textContent).not.toContain("waiting for you")
    })

    it("approves inline through the Door's run, the focus on Cancel then on the outcome, Settings not closing on Escape meanwhile", async () => {
        const { laptop, phone, net } = await signedIn()
        const asker = await asking(net, phone)
        await render()
        await until(() => codeField(phone) !== null)

        await approveIn(phone, codeOf(asker.state))
        await until(() => seatOf(phone.storage.deviceId)?.textContent?.includes("Checking the code with Chrome on Android…") === true)
        expect(document.activeElement).toBe(buttonIn(seatOf(phone.storage.deviceId), "Cancel"))
        expect(buttonIn(seatOf(phone.storage.deviceId), "Not mine")).toBeUndefined()
        expect(settingsAnswering).toBe(true)

        for (let i = 0; i < 8 && runtime?.seats().seat?.stage !== "approved"; i++) {
            await act(async () => asker.tick())
            await advance(3_000)
            expect(runtime?.snapshot()).toBeNull()
        }
        await until(() => seatOf(phone.storage.deviceId)?.textContent?.includes("Chrome on Android is one of your devices now.") === true)
        expect(document.activeElement?.textContent).toContain("Chrome on Android is one of your devices now.")
        expect(settingsAnswering).toBe(false)
        expect(net.approvals).toContainEqual({ approver: laptop.storage.deviceId, approved: phone.storage.deviceId })
    })

    it("holds the other seat's Approve while one exchange runs", async () => {
        const { phone, tablet, net } = await signedIn()
        const onPhone = await asking(net, phone)
        const onTablet = await asking(net, tablet)
        await render()
        await until(() => codeField(phone) !== null && codeField(tablet) !== null)

        await typeCode(seatOf(tablet.storage.deviceId), codeOf(onTablet.state))
        expect(buttonIn(seatOf(tablet.storage.deviceId), "Approve")?.disabled).toBe(false)
        await approveIn(phone, codeOf(onPhone.state))
        await until(() => runtime?.seats().seat?.stage === "working")

        expect(buttonIn(seatOf(tablet.storage.deviceId), "Approve")?.disabled).toBe(true)
    })

    it("says the note of a wrong code in a live region, its next request still in the seat", async () => {
        const { phone, net } = await signedIn()
        const asker = await asking(net, phone)
        await render()
        await until(() => codeField(phone) !== null)

        await approveIn(phone, other(codeOf(asker.state)))
        for (let i = 0; i < 6 && runtime?.seats().seat?.stage !== "failed"; i++) {
            await act(async () => asker.tick())
            await advance(3_000)
        }
        await until(() => seatOf(phone.storage.deviceId)?.querySelector("[role=alert]")?.textContent?.includes("That code didn't match") === true)
        expect(document.activeElement?.textContent).toContain("That code didn't match")

        await act(async () => asker.tick())
        await act(async () => asker.again())
        await act(async () => runtime?.refresh())
        await until(() => codeField(phone) !== null)
        const live = [...(seatOf(phone.storage.deviceId)?.querySelectorAll("[role=status]") ?? [])].map((r) => r.textContent)
        expect(live).toContain("That code didn't match — type the new one it shows.")
        expect(runtime?.snapshot()).toBeNull()
    })

    it("counts the waiting devices on Settings' Devices tile, and opens Settings on Devices from a link", async () => {
        await signedIn()
        await render()
        await until(() => waitingOnTile === 2)
        expect(settingsSection).toBe("profile")

        await act(async () => void (await paneRouter?.navigate({ href: "/home?settings=devices" })))

        await until(() => settingsSection === "devices")
        expect(useAppStore.getState().showSettings).toBe(true)
    })

    it("signs a waiting device out with “Not mine”, through the revoke flow", async () => {        const { laptop, tablet, net } = await signedIn()
        const removed = vi.spyOn(laptop.e2ee, "revokeDevice").mockResolvedValue({ removed_from: [] })
        const markRevoked = vi.spyOn(net.directory, "markRevoked")
        await render()
        await until(() => buttonIn(seatOf(tablet.storage.deviceId), "Not mine") !== undefined)
        expect(buttonIn(seatOf(tablet.storage.deviceId), "Not mine")?.getAttribute("aria-label")).toBe("Not mine: sign out Safari on iPadOS")

        await act(async () => buttonIn(seatOf(tablet.storage.deviceId), "Not mine")?.click())

        await until(() => removed.mock.calls.length === 1)
        expect(markRevoked).toHaveBeenCalledWith(IDP, laptop.token, tablet.storage.deviceId)
        expect(net.rows.get(tablet.storage.deviceId)?.revoked_at).not.toBeNull()
    })

    it("goes on at the Door once the pane goes, mid-exchange", async () => {
        const { phone, net } = await signedIn()
        const asker = await asking(net, phone)
        await render()
        await until(() => codeField(phone) !== null)
        await approveIn(phone, codeOf(asker.state))
        await until(() => runtime?.seats().seat?.stage === "working")
        await act(async () => closePane?.())

        expect(runtime?.seats().seat).toBeNull()
        expect(runtime?.snapshot()?.stage).toBe("working")
    })

    it("answers inline under StrictMode, one request, one exchange", async () => {
        const { laptop, phone, net } = await signedIn()
        const asker = await asking(net, phone)
        await render(true)
        await until(() => codeField(phone) !== null)
        expect(runtime?.snapshot()).toBeNull()

        await approveIn(phone, codeOf(asker.state))
        for (let i = 0; i < 8 && runtime?.seats().seat?.stage !== "approved"; i++) {
            await act(async () => asker.tick())
            await advance(3_000)
        }
        await until(() => seatOf(phone.storage.deviceId)?.textContent?.includes("Chrome on Android is one of your devices now.") === true)
        expect(net.approvals.filter((a) => a.approved === phone.storage.deviceId)).toEqual([
            { approver: laptop.storage.deviceId, approved: phone.storage.deviceId },
        ])
    })
})
