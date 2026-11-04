/**
 * Each of a user's devices keeps the groups it holds in step: the commits it missed first, then the
 * device list read again and judged, then the leaves it doesn't trust committed out and the
 * approved devices without a leaf added — never itself nor one it didn't find approved.
 */
import { describe, expect, it, vi } from "vitest"

import { asActorUri } from "@pinai/domain/models/identity"
import { undecided, type DeviceTrustVerdict } from "@pinai/domain/models/device-trust"
import { devicesToAdd } from "@pinai/domain/models/group"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import type { LeafVerdict } from "@pinai/domain/models/leaf-trust"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { oneAtATime, syncOwnGroupsUseCase } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"

const IDP = "http://localhost:8080"
const DAN = asActorUri("https://idp.dan.test/users/dan_k2m9x")
const BOB = asActorUri("https://idp.bob.test/users/bob_k2m9x")
const root = (n: number) => new Uint8Array(32).fill(n)

const trusting: DeviceTrustVerdict = {
    acting: true,
    generation: 1,
    thisDevice: "dan-1",
    listed: [
        { deviceId: "dan-1", rootKey: root(1) },
        { deviceId: "dan-2", rootKey: root(2) },
        { deviceId: "dan-3", rootKey: root(3) },
    ],
    approved: [
        { deviceId: "dan-1", rootKey: root(1) },
        { deviceId: "dan-2", rootKey: root(2) },
        { deviceId: "dan-3", rootKey: root(3) },
    ],
    unsettled: [],
}

describe("devicesToAdd", () => {
    const leaf = (actorUri: typeof DAN, deviceId: string, n: number): LeafVerdict => ({ ok: true, actorUri, deviceId, rootKey: root(n) })

    it("names the approved devices no verified leaf of the group stands for", () => {
        const leaves = [leaf(BOB, "bob-1", 9), leaf(DAN, "dan-1", 1), leaf(DAN, "dan-2", 2)]

        expect(devicesToAdd(leaves, DAN, trusting)).toEqual([{ deviceId: "dan-3", rootKey: root(3) }])
    })

    it("doesn't take someone else's leaf on the same device id for the user's", () => {
        expect(devicesToAdd([leaf(BOB, "dan-2", 2), leaf(BOB, "dan-3", 3)], DAN, trusting).map((d) => d.deviceId)).toEqual([
            "dan-2",
            "dan-3",
        ])
    })
})

function e2ee(change: Partial<Record<keyof IE2eePort, unknown>> = {}) {
    return {
        catchUp: vi.fn().mockResolvedValue(undefined),
        refreshOwnLeaf: vi.fn().mockResolvedValue({ refreshed: false }),
        reviewDevices: vi.fn().mockResolvedValue(trusting),
        removeUntrustedLeaves: vi.fn().mockResolvedValue({ removed: 0 }),
        addOwnDevices: vi.fn().mockResolvedValue({ added: 1, unclaimed: [] }),
        ...change,
    } as unknown as Pick<IE2eePort, "catchUp" | "refreshOwnLeaf" | "reviewDevices" | "removeUntrustedLeaves" | "addOwnDevices"> &
        Record<string, ReturnType<typeof vi.fn>>
}

const listed = [{ device_id: "dan-1" }, { device_id: "dan-2" }] as DeviceListEntry[]
const directory = (listDevices = vi.fn().mockResolvedValue({ devices: listed })) => ({ listDevices })

describe("syncOwnGroupsUseCase", () => {
    it("catches every group up and makes its own leaf current, reads the list again and judges it, then drops and adds leaves", async () => {
        const order: string[] = []
        const log = (what: string, answer: unknown = undefined) =>
            vi.fn().mockImplementation(async (_i: string, _t: string, id: unknown) => (order.push(`${what} ${String(id)}`), answer))
        const port = e2ee({
            catchUp: log("catch up"),
            refreshOwnLeaf: log("refresh", { refreshed: true }),
            reviewDevices: vi.fn().mockImplementation(async () => (order.push("review"), trusting)),
            removeUntrustedLeaves: log("drop", { removed: 1 }),
            addOwnDevices: log("add", { added: 1, unclaimed: [] }),
        })
        const devices = directory(vi.fn().mockImplementation(async () => (order.push("list"), { devices: listed })))

        const outcome = await syncOwnGroupsUseCase(IDP, "tok", DAN, ["g1", "g2"], { e2ee: port, deviceDirectory: devices })

        expect(outcome).toEqual({ added: 2, removed: 2, unclaimed: [], failed: [] })
        expect(order).toEqual([
            "catch up g1",
            "refresh g1",
            "catch up g2",
            "refresh g2",
            "list",
            "review",
            "drop g1",
            "add g1",
            "drop g2",
            "add g2",
        ])
        expect(port.reviewDevices).toHaveBeenCalledWith(IDP, "tok", DAN, listed)
        expect(port.addOwnDevices).toHaveBeenCalledWith(IDP, "tok", "g1", trusting)
        expect(port.removeUntrustedLeaves).toHaveBeenCalledWith(IDP, "tok", "g1", trusting, expect.any(Function))
    })

    it("reads the list again once a run before an own leaf goes, and acts on that list from then on", async () => {
        const fresh = { ...trusting, approved: trusting.approved.slice(0, 1) }
        const reviews = [trusting, fresh]
        const asked: unknown[] = []
        const port = e2ee({
            reviewDevices: vi.fn().mockImplementation(async () => reviews.shift()),
            removeUntrustedLeaves: vi.fn().mockImplementation(async (_i, _t, id, trust, reviewAgain) => {
                asked.push([id, trust === trusting ? "first" : "fresh"])
                await reviewAgain()
                await reviewAgain()
                return { removed: 0 }
            }),
        })
        const listDevices = vi.fn().mockResolvedValue({ devices: listed })

        await syncOwnGroupsUseCase(IDP, "tok", DAN, ["g1", "g2"], { e2ee: port, deviceDirectory: directory(listDevices) })

        expect(listDevices).toHaveBeenCalledTimes(2)
        expect(asked).toEqual([
            ["g1", "first"],
            ["g2", "fresh"],
        ])
        expect(port.addOwnDevices).toHaveBeenCalledWith(IDP, "tok", "g1", fresh)
    })

    it("adds nobody on a device that doesn't act on approval, but still drops the leaves failing their checks", async () => {
        const port = e2ee({ reviewDevices: vi.fn().mockResolvedValue(undecided("dan-1")) })

        const outcome = await syncOwnGroupsUseCase(IDP, "tok", DAN, ["g1"], { e2ee: port, deviceDirectory: directory() })

        expect(outcome).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [] })
        expect(port.removeUntrustedLeaves).toHaveBeenCalledWith(IDP, "tok", "g1", undecided("dan-1"), expect.any(Function))
        expect(port.addOwnDevices).not.toHaveBeenCalled()
    })

    it("reviews the list with no conversation at all", async () => {
        const port = e2ee()

        await syncOwnGroupsUseCase(IDP, "tok", DAN, [], { e2ee: port, deviceDirectory: directory() })

        expect(port.reviewDevices).toHaveBeenCalledOnce()
    })

    it("judges nobody on a list it couldn't read, and says so", async () => {
        const failure = new Error("connection reset")
        const port = e2ee()

        const outcome = await syncOwnGroupsUseCase(IDP, "tok", DAN, ["g1"], {
            e2ee: port,
            deviceDirectory: directory(vi.fn().mockRejectedValue(failure)),
        })

        expect(outcome).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [], reviewFailure: failure })
        expect(port.reviewDevices).not.toHaveBeenCalled()
        expect(port.removeUntrustedLeaves).toHaveBeenCalledWith(IDP, "tok", "g1", null, expect.any(Function))
        expect(port.addOwnDevices).not.toHaveBeenCalled()
    })

    it("adds the siblings to a group whose own leaf it couldn't refresh, and says so", async () => {
        const failure = new Error("connection reset")
        const port = e2ee({ refreshOwnLeaf: vi.fn().mockRejectedValueOnce(failure) })

        const outcome = await syncOwnGroupsUseCase(IDP, "tok", DAN, ["g1"], { e2ee: port, deviceDirectory: directory() })

        expect(outcome).toEqual({ added: 1, removed: 0, unclaimed: [], failed: [{ conversationId: "g1", error: failure }] })
    })

    it("goes no further in a group it couldn't catch up", async () => {
        const failure = new Error("connection reset")
        const port = e2ee({ catchUp: vi.fn().mockRejectedValueOnce(failure) })

        const outcome = await syncOwnGroupsUseCase(IDP, "tok", DAN, ["g1"], { e2ee: port, deviceDirectory: directory() })

        expect(outcome).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [{ conversationId: "g1", error: failure }] })
        expect(port.refreshOwnLeaf).not.toHaveBeenCalled()
        expect(port.removeUntrustedLeaves).not.toHaveBeenCalled()
        expect(port.addOwnDevices).not.toHaveBeenCalled()
    })

    it("goes on past a group whose commit out or add fails, and says which", async () => {
        const failure = new Error("connection reset")
        const port = e2ee({
            removeUntrustedLeaves: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ removed: 0 }),
            addOwnDevices: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ added: 1, unclaimed: [] }),
        })

        const outcome = await syncOwnGroupsUseCase(IDP, "tok", DAN, ["g1", "g2"], { e2ee: port, deviceDirectory: directory() })

        expect(outcome).toEqual({
            added: 1,
            removed: 0,
            unclaimed: [],
            failed: [
                { conversationId: "g1", error: failure },
                { conversationId: "g1", error: failure },
            ],
        })
    })
})

describe("oneAtATime", () => {
    it("runs one sync at a time, then the calls made meanwhile once, with the latest arguments", async () => {
        const runs: string[] = []
        let release!: () => void
        const first = new Promise<void>((resolve) => (release = resolve))
        const sync = oneAtATime(async (what: string) => {
            runs.push(what)
            if (what === "a") await first
            return what
        })

        const answers = [sync("a"), sync("b"), sync("c")]
        await Promise.resolve()
        expect(runs).toEqual(["a"])
        release()

        expect(await Promise.all(answers)).toEqual(["a", "c", "c"])
        expect(runs).toEqual(["a", "c"])
        expect(await sync("d")).toBe("d")
    })

    it("goes on after a run that failed", async () => {
        let fail = true
        const sync = oneAtATime(async (what: string) => {
            if (fail) {
                fail = false
                throw new Error("connection reset")
            }
            return what
        })

        const answers = [sync("a"), sync("b")]

        await expect(answers[0]).rejects.toThrow("connection reset")
        expect(await answers[1]).toBe("b")
    })
})
