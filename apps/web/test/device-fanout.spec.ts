/**
 * When the groups are kept in step with the account's devices, for every client (`identity-provider/specs/e2ee.md
 * § 6.2`): once a device list is held, at each change of what a review reads of it — a refetch that changed nothing
 * runs nothing —, of the conversation ids and on a group held; a sibling left unclaimed tried again on
 * `unclaimedRetryDelay` until none is left. Nothing after `stop`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DeviceListEntry } from "@pinai/domain/models/device"
import type { ActorUri, ConversationId, DeviceId } from "@pinai/domain/models/e2ee"
import { DeviceFanout } from "@pinai/domain/usecases/e2ee/device-fanout.usecase"
import type { OwnGroupsSync } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"

const IDP = "https://idp.test"
const ACTOR = "https://idp.test/users/dan" as ActorUri

const outcome = (more: Partial<OwnGroupsSync> = {}): OwnGroupsSync => ({ added: 0, removed: 0, unclaimed: [], failed: [], ...more })
const device = (id: string, more: Partial<DeviceListEntry> = {}) => ({ device_id: id, ...more }) as DeviceListEntry
const ids = (...list: string[]) => list as ConversationId[]

function fanout(options: { token?: string | null } = {}) {
    const token = options.token === undefined ? "tok" : options.token
    const held = new Set<(conversationId: ConversationId) => void>()
    const registered = new Set<() => void>()
    const e2ee = {
        onGroupHeld: (listener: (conversationId: ConversationId) => void) => {
            held.add(listener)
            return () => void held.delete(listener)
        },
        onDeviceRegistered: (listener: () => void) => {
            registered.add(listener)
            return () => void registered.delete(listener)
        },
    }
    const sync = vi.fn(async (..._args: unknown[]) => outcome())
    const refreshDevices = vi.fn()
    const report = vi.fn()
    const made = new DeviceFanout({
        session: { idpUrl: IDP, actorUri: ACTOR, accessToken: () => token },
        e2ee,
        sync,
        refreshDevices,
        report,
    })
    return {
        made,
        sync,
        refreshDevices,
        report,
        groupHeld: () => held.forEach((listener) => listener("g9" as ConversationId)),
        registration: () => registered.forEach((listener) => listener()),
        subscribed: () => held.size + registered.size,
    }
}

const settle = () => vi.advanceTimersByTimeAsync(0)

describe("DeviceFanout", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("syncs nothing before a device list is held, then syncs with the conversation ids", async () => {
        const { made, sync, groupHeld } = fanout()
        made.start()
        made.conversationsChanged(ids("g1", "g2"))
        groupHeld()
        await settle()
        expect(sync).not.toHaveBeenCalled()

        made.devicesListed([device("laptop")])
        await settle()
        expect(sync).toHaveBeenCalledExactlyOnceWith(IDP, "tok", ACTOR, ["g1", "g2"])
    })

    it("syncs a list given before it started as it starts, with no conversation too", async () => {
        const { made, sync } = fanout()
        made.devicesListed([device("laptop")])
        await settle()
        expect(sync).not.toHaveBeenCalled()

        made.start()
        await settle()
        expect(sync).toHaveBeenCalledExactlyOnceWith(IDP, "tok", ACTOR, [])
    })

    it("runs only on a real change of what a review reads of the list", async () => {
        const { made, sync } = fanout()
        made.start()
        made.devicesListed([device("laptop", { last_seen_at: "2026-11-27T10:00:00Z" } as never)])
        await settle()
        made.devicesListed([device("laptop", { last_seen_at: "2026-11-27T11:00:00Z" } as never)])
        await settle()
        expect(sync).toHaveBeenCalledTimes(1)

        made.devicesListed([device("laptop"), device("phone")])
        await settle()
        expect(sync).toHaveBeenCalledTimes(2)
    })

    it("runs again when the conversation ids change, not when they stay", async () => {
        const { made, sync } = fanout()
        made.start()
        made.devicesListed([device("laptop")])
        made.conversationsChanged(ids("g1"))
        await settle()
        expect(sync).toHaveBeenCalledTimes(2)

        made.conversationsChanged(ids("g1"))
        await settle()
        expect(sync).toHaveBeenCalledTimes(2)
    })

    it("runs again on a group held", async () => {
        const { made, sync, groupHeld } = fanout()
        made.start()
        made.devicesListed([device("laptop")])
        await settle()
        groupHeld()
        await settle()

        expect(sync).toHaveBeenCalledTimes(2)
    })

    it("tries an unclaimed sibling again 5 s, 15 s, 60 s on, and stops once it is added", async () => {
        const { made, sync } = fanout()
        const answers = [["phone"], ["phone"], ["phone"], []]
        sync.mockImplementation(async () => outcome({ unclaimed: (answers.shift() ?? []) as DeviceId[] }))
        made.start()
        made.devicesListed([device("laptop")])
        await settle()
        expect(sync).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(4_999)
        expect(sync).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(sync).toHaveBeenCalledTimes(2)
        await vi.advanceTimersByTimeAsync(15_000)
        expect(sync).toHaveBeenCalledTimes(3)
        await vi.advanceTimersByTimeAsync(60_000)
        expect(sync).toHaveBeenCalledTimes(4)

        await vi.advanceTimersByTimeAsync(60 * 60_000)
        expect(sync).toHaveBeenCalledTimes(4)
    })

    it("starts the backoff over once none was left", async () => {
        const { made, sync, groupHeld } = fanout()
        const answers = [["phone"], [], ["tablet"]]
        sync.mockImplementation(async () => outcome({ unclaimed: (answers.shift() ?? []) as DeviceId[] }))
        made.start()
        made.devicesListed([device("laptop")])
        await settle()
        await vi.advanceTimersByTimeAsync(5_000)
        expect(sync).toHaveBeenCalledTimes(2)

        groupHeld()
        await settle()
        expect(sync).toHaveBeenCalledTimes(3)
        await vi.advanceTimersByTimeAsync(5_000)
        expect(sync).toHaveBeenCalledTimes(4)
    })

    it("asks the platform to read the list again after a registration", () => {
        const { made, refreshDevices, registration } = fanout()
        made.start()
        registration()

        expect(refreshDevices).toHaveBeenCalledTimes(1)
    })

    it("reports what failed, each conversation by its id", async () => {
        const { made, sync, report } = fanout()
        sync.mockResolvedValueOnce(
            outcome({ reviewFailure: "list", shareFailure: "share", failed: [{ conversationId: "g1" as ConversationId, error: "epoch" }] }),
        )
        made.start()
        made.devicesListed([device("laptop")])
        await settle()
        expect(report).toHaveBeenCalledWith("reviewing the device list", "list")
        expect(report).toHaveBeenCalledWith("sharing the history passphrase; tried again at the next refresh", "share")
        expect(report).toHaveBeenCalledWith("keeping g1 in step", "epoch")

        sync.mockRejectedValueOnce(new Error("down"))
        made.devicesListed([device("phone")])
        await settle()
        expect(report).toHaveBeenCalledWith("keeping the groups in step", expect.any(Error))
    })

    it("syncs nothing without a token", async () => {
        const { made, sync } = fanout({ token: null })
        made.start()
        made.devicesListed([device("laptop")])
        await settle()

        expect(sync).not.toHaveBeenCalled()
    })

    it("schedules nothing and hears nothing once stopped", async () => {
        const { made, sync, groupHeld, subscribed } = fanout()
        sync.mockResolvedValue(outcome({ unclaimed: ["phone" as DeviceId] }))
        made.start()
        made.devicesListed([device("laptop")])
        await settle()
        made.stop()
        expect(subscribed()).toBe(0)

        groupHeld()
        made.devicesListed([device("phone")])
        made.conversationsChanged(ids("g1"))
        await vi.advanceTimersByTimeAsync(60 * 60_000)
        expect(sync).toHaveBeenCalledTimes(1)
    })

    it("schedules no retry for a sync that ends after it stopped", async () => {
        const { made, sync } = fanout()
        let finish!: (value: OwnGroupsSync) => void
        sync.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
        made.start()
        made.devicesListed([device("laptop")])
        made.stop()
        finish(outcome({ unclaimed: ["phone" as DeviceId] }))
        await vi.advanceTimersByTimeAsync(60 * 60_000)

        expect(sync).toHaveBeenCalledTimes(1)
    })
})
