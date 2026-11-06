/**
 * The re-archive as the app runs it (`presentation/_libs/history-rearchive.ts`): the persisted cache
 * read through the store once it was read back, and the restore's pattern in the corner — one keyed
 * toast, raised only while the app is mounted, "Re-saving your history… N of M messages", then "Your
 * history is saved under your new words", or the failure and the next start, warned of; dismissed
 * when a later generation drops it or the user signs out. On fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UserProfile } from "@pinai/domain/models/auth"
import { IdpError } from "@pinai/domain/models/idp-error"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { replaceWordsUseCase } from "@pinai/domain/usecases/e2ee/replace-words.usecase"
import { rearchiveDueHistory, showRearchiveInApp } from "@/presentation/_libs/history-rearchive"
import type { Message } from "@/lib/types"
import { useAppStore } from "@/store/store"

import { ACTOR, FakeHistoryIdp, IDP, historyDevice, nameSession } from "./setup/history-idp"

const wired = vi.hoisted(() => ({ e2ee: null as unknown }))
vi.mock("@/ioc", () => ({ getE2eePort: () => wired.e2ee }))
const toast = vi.hoisted(() => ({ loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const ME = "alice_xk9mp@idp.test"
const C1 = "11112222-3333-4444-5555-666677778888"
const C2 = "aaaabbbb-cccc-4ddd-8eee-ffff00001111"
const message = (n: number): Message => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    author: "Bob",
    authorAddress: "bob_a1b2c@idp.test",
    avatar: "BO",
    content: `text ${n}`,
    timestamp: "10:00",
    createdAt: new Date(Date.UTC(2026, 9, 1, 10, 0, n)).toISOString(),
    color: "#a78bfa",
})

async function replaced() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop")
    await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    await replaceWordsUseCase({ ...laptop.deps, cacheRead: () => true, applyRestored: async () => undefined })({
        idpUrl: IDP,
        accessToken: laptop.token,
        actorUri: ACTOR,
        tokenArrivedAt: Date.now(),
    })
    wired.e2ee = laptop.e2ee
    useAppStore.setState({
        idpUrl: IDP,
        accessToken: laptop.token,
        user: { address: ME, actor_uri: ACTOR } as UserProfile,
        dmMessages: { [C1]: [message(1), message(2)], [C2]: [message(3)] },
    })
    return { idp, laptop }
}

async function settle<T>(promise: Promise<T>): Promise<T> {
    let done = false
    void promise.finally(() => (done = true))
    for (let i = 0; i < 200 && !done; i++) await vi.advanceTimersByTimeAsync(1_000)
    expect(done).toBe(true)
    return promise
}

let leave: (() => void) | null = null
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.spyOn(useAppStore.persist, "hasHydrated").mockReturnValue(true)
    for (const fn of Object.values(toast)) fn.mockClear()
})

afterEach(() => {
    leave?.()
    leave = null
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("the re-archive in the app", () => {
    it("reads the cache read back, and says how far it got in the corner, then that the history is saved", async () => {
        const { idp, laptop } = await replaced()
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        leave = showRearchiveInApp()

        expect(await settle(rearchiveDueHistory())).toEqual({ kind: "rearchived", generation: 2, messages: 3, skipped: 0 })

        expect(toast.loading.mock.calls.map(([title]) => title)).toEqual([
            "Re-saving your history… 0 of 3 messages",
            "Re-saving your history… 2 of 3 messages",
            "Re-saving your history… 3 of 3 messages",
        ])
        expect(toast.success).toHaveBeenCalledWith("Your history is saved under your new words", { id: "history-rearchive", description: undefined })
        expect(idp.archive.size).toBe(3)
        expect(laptop.storage.rearchiveDue).toBeNull()
    })

    it("a failure says it's tried again at the next start, warns of it, and leaves the re-archive due", async () => {
        const { idp, laptop } = await replaced()
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        vi.spyOn(idp, "uploadBatch").mockRejectedValue(new IdpError(401, "invalid_token", "expired"))
        leave = showRearchiveInApp()

        expect(await settle(rearchiveDueHistory())).toMatchObject({ kind: "failed", generation: 2 })
        expect(toast.error).toHaveBeenCalledWith("Your history couldn't be saved again", {
            id: "history-rearchive",
            description: "It's tried again the next time Pīna'i starts.",
        })
        expect(warn).toHaveBeenCalledWith("[e2ee] archiving the history again", "expired")
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })
    })

    it("dropped for a later generation, its toast goes without a word", async () => {
        const { idp } = await replaced()
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        const rival = historyDevice(idp, "rival")
        await nameSession(rival)
        vi.spyOn(idp, "uploadBatch").mockImplementationOnce(async (...args) => {
            const inserted = await FakeHistoryIdp.prototype.uploadBatch.apply(idp, args)
            await idp.setKey(IDP, rival.token, (await rival.e2ee.mintHistoryKey(3)).key)
            return inserted
        })
        leave = showRearchiveInApp()

        expect(await settle(rearchiveDueHistory())).toEqual({ kind: "abandoned", generation: 2 })
        expect(toast.dismiss).toHaveBeenCalledWith("history-rearchive")
        expect(toast.error).not.toHaveBeenCalled()
        expect(toast.success).not.toHaveBeenCalled()
    })

    it("signed out mid-way, its toast goes: no failure on the landing", async () => {
        const { idp } = await replaced()
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        vi.spyOn(idp, "uploadBatch").mockImplementationOnce(async (...args) => {
            useAppStore.setState({ accessToken: null })
            return FakeHistoryIdp.prototype.uploadBatch.apply(idp, args)
        })
        leave = showRearchiveInApp()

        expect(await settle(rearchiveDueHistory())).toEqual({ kind: "signed-out", generation: 2 })
        leave()
        leave = null
        expect(toast.dismiss).toHaveBeenCalledWith("history-rearchive")
        expect(toast.error).not.toHaveBeenCalled()
    })

    it("raises nothing while the app isn't mounted — and settles nothing it never raised", async () => {
        await replaced()
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })

        expect(await settle(rearchiveDueHistory())).toMatchObject({ kind: "rearchived", messages: 3 })
        expect(toast.loading).not.toHaveBeenCalled()
        expect(toast.success).not.toHaveBeenCalled()
    })

    it("waits for the cache to be read back: never re-archives the empty defaults", async () => {
        const { idp } = await replaced()
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        vi.mocked(useAppStore.persist.hasHydrated).mockReturnValue(false)
        const upload = vi.spyOn(idp, "uploadBatch")

        void rearchiveDueHistory()
        await vi.advanceTimersByTimeAsync(10_000)
        expect(upload).not.toHaveBeenCalled()
        expect(toast.loading).not.toHaveBeenCalled()
    })
})
