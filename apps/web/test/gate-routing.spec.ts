/**
 * The onboarding gate (`identity-provider/specs/e2ee.md § 3.6`; the design's § 5.2 and § 5.4): only
 * a device that is in reaches the app. The first device — no key in force, or its own pending — goes
 * to setup; a device that never held the account's passphrase to the new-device page; one whose
 * words no longer give the key in force to the reset page, worded for a start over elsewhere or for
 * a change no start over makes. The table is the domain's; the use case runs on the real E2EE
 * engine against an IdP answering as the spec says.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { decideGateRoute, resetCause, type Admission } from "@pinai/domain/models/admission"
import type { HistoryKeyStanding, MismatchReason } from "@pinai/domain/models/history-key"
import { IdpError, isUnreachable } from "@pinai/domain/models/idp-error"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { gateThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"

import { ACTOR, FakeHistoryIdp, IDP, historyDevice } from "./setup/history-idp"

afterEach(() => {
    vi.restoreAllMocks()
})

const IN: Admission = { kind: "in", by: "passphrase" }
const OUT: Admission = { kind: "out" }
const mismatch = (reason: MismatchReason, generation = 2, held: number | null = 1): HistoryKeyStanding => ({
    kind: "mismatch",
    generation,
    setByDevice: "laptop",
    reason,
    held,
})
const route = (standing: HistoryKeyStanding, admission: Admission) => decideGateRoute({ pending: false, standing, admission })

describe("the gate's table", () => {
    it("sends the first device to setup: no key in force, or its own pending", () => {
        expect(route({ kind: "no-key" }, OUT)).toBe("setup")
        expect(decideGateRoute({ pending: true })).toBe("setup")
    })

    it("lets in a device that is in, holding the words or approved by a partner", () => {
        expect(route({ kind: "holds", generation: 2, settled: true }, IN)).toBe("app")
        expect(route(mismatch("check-value"), { kind: "in", by: "partner", partner: "laptop" })).toBe("app")
        expect(route({ kind: "no-passphrase", generation: 2 }, { kind: "in", by: "partner", partner: "laptop" })).toBe("app")
    })

    it("keeps a new device that is out on the new-device page", () => {
        expect(route({ kind: "no-passphrase", generation: 2 }, OUT)).toBe("new-device")
    })

    it("sends an old device after a reset, or one whose key changed under the same generation, to the reset page", () => {
        for (const reason of ["check-value", "approval-key", "rollback", "relabelled"] as const) {
            expect(route(mismatch(reason), OUT)).toBe("reset")
        }
        expect(route(mismatch("check-value", 1, 1), OUT)).toBe("reset")
        expect(route(mismatch("rollback", 0, null), OUT)).toBe("reset")
    })

    it("words the reset for a start over elsewhere only when a newer generation was set", () => {
        expect(resetCause(mismatch("check-value", 2, 1))).toBe("newer-generation")
        expect(resetCause(mismatch("check-value", 1, 1))).toBe("unknown-change")
        expect(resetCause(mismatch("approval-key", 1, 1))).toBe("unknown-change")
        expect(resetCause(mismatch("rollback", 1, 2))).toBe("unknown-change")
        expect(resetCause(mismatch("relabelled", 2, 1))).toBe("unknown-change")
        expect(resetCause({ kind: "no-passphrase", generation: 2 })).toBeNull()
    })
})

describe("an IdP out of reach", () => {
    it("is no answer at all, or a server failing: never a refusal, nor an answer that makes no sense", () => {
        expect(isUnreachable(new TypeError("Failed to fetch"))).toBe(true)
        expect(isUnreachable(Object.assign(new Error("Request timed out"), { name: "TimeoutError" }))).toBe(true)
        expect(isUnreachable(new IdpError(503, "", "Service unavailable"))).toBe(true)
        expect(isUnreachable(new IdpError(401, "invalid_token", "Sign in again"))).toBe(false)
        expect(isUnreachable(new IdpError(404, "not_found", "No such thing"))).toBe(false)
        expect(isUnreachable(new Error("The IdP answered a history key that isn't one"))).toBe(false)
    })
})

describe("the gate on a device", () => {
    const gate = (device: ReturnType<typeof historyDevice>) => gateThisDeviceUseCase(device.deps)(IDP, device.token, ACTOR)

    async function account() {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")
        await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
        return { idp, laptop }
    }

    it("sends the first device to setup before its key is set, and when its key is pending", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")
        expect(await gate(laptop)).toBe("setup")

        await laptop.e2ee.mintHistoryKey(1)
        idp.log.length = 0
        expect(await gate(laptop)).toBe("setup")
        expect(idp.log).toEqual([])
    })

    it("lets in the device holding the key, and keeps a new device out on the new-device page", async () => {
        const { idp, laptop } = await account()
        expect(await gate(laptop)).toBe("app")
        expect(await gate(historyDevice(idp, "phone"))).toBe("new-device")
    })

    it("sends the device to the reset page once another device starts over, or its key changes under the same generation", async () => {
        const { idp, laptop } = await account()
        const held = idp.key!

        idp.key = { ...held, approvalPublicKey: ed25519.keygen().publicKey }
        expect(await gate(laptop)).toBe("reset")
        expect(resetCause(await laptop.e2ee.historyKeyStanding())).toBe("unknown-change")

        idp.key = held
        expect(await gate(laptop)).toBe("app")

        const other = historyDevice(idp, "elsewhere")
        await idp.session().linkDevice(IDP, other.token, other.storage.deviceId)
        await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey(2)).key)
        expect(await gate(laptop)).toBe("reset")
        expect(resetCause(await laptop.e2ee.historyKeyStanding())).toBe("newer-generation")
    })

    it("out of reach, decides on what was last recorded: a device let in reloads in, one kept out stays on its page", async () => {
        const { idp, laptop } = await account()
        const phone = historyDevice(idp, "phone")
        expect(await gate(phone)).toBe("new-device")
        vi.spyOn(idp, "getKey").mockRejectedValue(new TypeError("Failed to fetch"))

        expect(await gate(historyDevice(idp, "laptop", laptop.storage))).toBe("app")
        expect(await gate(historyDevice(idp, "phone", phone.storage))).toBe("new-device")
    })

    it("out of reach, lets in a device a partner let in, its admission recorded", async () => {
        const { idp } = await account()
        const phone = historyDevice(idp, "phone")
        phone.storage.standing = { kind: "no-passphrase", generation: 1 }
        phone.storage.admission = { kind: "in", by: "partner", partner: "laptop" }
        vi.spyOn(idp, "getKey").mockRejectedValue(new IdpError(503, "", "Service unavailable"))

        expect(await gate(phone)).toBe("app")
    })

    it("goes to the error page for a failure that isn't the IdP out of reach, or with nothing recorded", async () => {
        const { idp, laptop } = await account()
        vi.spyOn(idp, "getKey").mockRejectedValueOnce(new IdpError(401, "invalid_token", "Sign in again"))
        await expect(gate(historyDevice(idp, "laptop", laptop.storage))).rejects.toThrow("Sign in again")

        vi.spyOn(idp, "getKey").mockRejectedValue(new TypeError("Failed to fetch"))
        await expect(gate(historyDevice(idp, "fresh"))).rejects.toThrow("Failed to fetch")
    })
})
