/**
 * The fanout tries again a sibling it couldn't claim a KeyPackage for (`identity-provider/specs/e2ee.md
 * § 6.2`): a device approved with the code publishes its stash only once in, after the approvals that
 * started the sync, and its upload starts no sync of its own. 5 s, 15 s, 60 s, 5 min, then every
 * 15 min while one is left; none once every sibling is in.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UserProfile } from "@pinai/domain/models/auth"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import type { DeviceTrustVerdict } from "@pinai/domain/models/device-trust"
import { UNCLAIMED_RETRY_MS, unclaimedRetryDelay } from "@pinai/domain/models/group"
import { useDeviceFanout } from "@/presentation/hooks/useDeviceFanout"
import { useAppStore } from "@/store/store"

const trusting: DeviceTrustVerdict = { acting: true, generation: 1, thisDevice: "laptop", listed: [], approved: [], approvedBy: [], unsettled: [], before: null }
const port = vi.hoisted(() => ({
    catchUp: async () => undefined,
    refreshOwnLeaf: async () => ({ refreshed: false }),
    reviewDevices: async () => null as unknown,
    removeUntrustedLeaves: async () => ({ removed: 0 }),
    addOwnDevices: null as unknown as (...args: unknown[]) => Promise<{ added: number; unclaimed: string[] }>,
    onGroupHeld: () => () => undefined,
    onDeviceRegistered: () => () => undefined,
    sealHistoryShares: async () => [],
    forgoHistoryShare: () => undefined,
    checkHistoryKey: async () => ({ kind: "holds", generation: 1, settled: true }),
}))
vi.mock("@/ioc", () => ({
    getE2eePort: () => port,
    getDeviceDirectoryPort: () => ({ listDevices: async () => ({ devices: [{ device_id: "laptop" }] as DeviceListEntry[] }) }),
    getKeySharePort: () => ({ share: async () => undefined, waiting: async () => null }),
}))

let root: Root | null = null

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
    port.reviewDevices = async () => trusting
    useAppStore.setState({
        idpUrl: "https://idp.test",
        accessToken: "tok",
        user: { actor_uri: "https://idp.test/users/dan" } as UserProfile,
        localDmConvos: [{ id: "g1" }] as never,
    })
})

afterEach(async () => {
    if (root) {
        const leaving = root
        root = null
        await act(async () => leaving.unmount())
    }
    vi.useRealTimers()
})

function Fanout() {
    useDeviceFanout()
    return null
}

async function render() {
    root = createRoot(document.createElement("div"))
    await act(async () => {
        root?.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Fanout)))
    })
}

const advance = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
    })

describe("the fanout's retries", () => {
    it("back off 5 s → 15 s → 60 s → 5 min, then every 15 min", () => {
        expect([0, 1, 2, 3, 4, 5, 9].map(unclaimedRetryDelay)).toEqual([5_000, 15_000, 60_000, 300_000, 900_000, 900_000, 900_000])
        expect(UNCLAIMED_RETRY_MS[0]).toBe(5_000)
    })

    it("sync again while a sibling stays unclaimed, and stop once it is added", async () => {
        const answers = [["phone"], ["phone"], ["phone"], []]
        const addOwnDevices = vi.fn(async () => ({ added: 0, unclaimed: answers.shift() ?? [] }))
        port.addOwnDevices = addOwnDevices
        await render()
        await advance(10)
        expect(addOwnDevices).toHaveBeenCalledTimes(1)

        await advance(4_900)
        expect(addOwnDevices).toHaveBeenCalledTimes(1)
        await advance(200)
        expect(addOwnDevices).toHaveBeenCalledTimes(2)
        await advance(15_000)
        expect(addOwnDevices).toHaveBeenCalledTimes(3)
        await advance(60_000)
        expect(addOwnDevices).toHaveBeenCalledTimes(4)

        await advance(60 * 60_000)
        expect(addOwnDevices).toHaveBeenCalledTimes(4)
    })

    it("schedule nothing once unmounted", async () => {
        const addOwnDevices = vi.fn(async () => ({ added: 0, unclaimed: ["phone"] }))
        port.addOwnDevices = addOwnDevices
        await render()
        await advance(10)
        await act(async () => root?.unmount())
        root = null

        await advance(60 * 60_000)
        expect(addOwnDevices).toHaveBeenCalledTimes(1)
    })
})
