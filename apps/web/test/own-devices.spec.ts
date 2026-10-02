/**
 * Each of a user's devices brings the others into the groups it holds keys for: only those
 * without a leaf there, never itself nor a revoked one, one group at a time.
 */
import { describe, expect, it, vi } from "vitest"

import { asActorUri } from "@pinai/domain/models/identity"
import { devicesToAdd, type GroupLeaf } from "@pinai/domain/models/group"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { addOwnDevicesUseCase } from "@pinai/domain/usecases/e2ee/add-own-devices.usecase"

const IDP = "http://localhost:8080"
const DAN = asActorUri("https://idp.dan.test/users/dan_k2m9x")
const BOB = asActorUri("https://idp.bob.test/users/bob_k2m9x")

function leaf(leafIndex: number, actorUri: typeof DAN, deviceId: string): GroupLeaf {
    return { leafIndex, actorUri, deviceId }
}

describe("devicesToAdd", () => {
    it("names the user's devices the group holds no leaf for", () => {
        const leaves = [leaf(0, BOB, "bob-1"), leaf(1, DAN, "dan-1"), leaf(2, DAN, "dan-2")]

        expect(devicesToAdd(leaves, DAN, ["dan-1", "dan-2", "dan-3"])).toEqual(["dan-3"])
    })

    it("doesn't take someone else's leaf on the same device id for the user's", () => {
        expect(devicesToAdd([leaf(0, BOB, "shared-id")], DAN, ["shared-id"])).toEqual(["shared-id"])
    })
})

function e2ee(addOwnDevices = vi.fn().mockResolvedValue({ added: 1 })) {
    return { addOwnDevices } as unknown as Pick<IE2eePort, "addOwnDevices">
}

describe("addOwnDevicesUseCase", () => {
    const devices = [
        { device_id: "dan-1", revoked_at: null },
        { device_id: "dan-2", revoked_at: null },
        { device_id: "dan-old", revoked_at: "2026-09-01T00:00:00Z" },
    ]

    it("offers each group the user's other active devices, one group at a time", async () => {
        const port = e2ee()

        const outcome = await addOwnDevicesUseCase(IDP, "tok", "dan-1", devices, ["g1", "g2"], port)

        expect(outcome).toEqual({ added: 2, failed: [] })
        expect(port.addOwnDevices).toHaveBeenNthCalledWith(1, IDP, "tok", "g1", ["dan-2"])
        expect(port.addOwnDevices).toHaveBeenNthCalledWith(2, IDP, "tok", "g2", ["dan-2"])
    })

    it("asks nothing when the user has no other active device", async () => {
        const port = e2ee()

        const outcome = await addOwnDevicesUseCase(IDP, "tok", "dan-1", devices.slice(0, 1), ["g1"], port)

        expect(outcome).toEqual({ added: 0, failed: [] })
        expect(port.addOwnDevices).not.toHaveBeenCalled()
    })

    it("goes on past a group that fails, and says which", async () => {
        const failure = new Error("connection reset")
        const port = e2ee(
            vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({ added: 1 }),
        )

        const outcome = await addOwnDevicesUseCase(IDP, "tok", "dan-1", devices, ["g1", "g2"], port)

        expect(outcome).toEqual({ added: 1, failed: [{ conversationId: "g1", error: failure }] })
    })
})
