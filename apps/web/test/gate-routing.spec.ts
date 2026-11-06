/**
 * The onboarding gate (`identity-provider/specs/e2ee.md § 3.6`; the design's § 5.2 and § 5.4): only
 * a device that is in reaches the app. The first device — no key in force, or its own pending — goes
 * to setup; a device that never held the account's passphrase to the new-device page; one whose
 * words a device it found approved replaced to the reset page. One holding words of an older key
 * over a reset it can't vouch for, or a change no start over makes, goes to the app under a banner. The table is the domain's; the use case runs on the real E2EE
 * engine against an IdP answering as the spec says.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { decideGateRoute, resetCause, type Admission } from "@pinai/domain/models/admission"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { withTrust } from "@pinai/domain/models/device-trust"
import type { HistoryKeyStanding, MismatchReason } from "@pinai/domain/models/history-key"
import { IdpError, isUnreachable } from "@pinai/domain/models/idp-error"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { gateDecisionUseCase, gateThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"

import { ACTOR, FakeHistoryIdp, IDP, historyDevice, nameSession } from "./setup/history-idp"

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

function listedRow(deviceId: string): DeviceListEntry {
    return {
        device_id: deviceId,
        display_name: "Chrome on Linux",
        kind: "laptop",
        paired_at: "2026-11-01T00:00:00Z",
        last_seen_at: "2026-11-04T00:00:00Z",
        revoked_at: null,
        signed_in: true,
        last_active_at: null,
        drk_public_key: null,
        attestation_signature: null,
        attestation_kid: null,
        attestation_expires_at: null,
        hpke_public_key: null,
        hpke_key_signature: null,
        history_generation: 2,
        approvals: [],
    }
}

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

    it("lets in a device its kept words let in", () => {
        expect(route(mismatch("check-value"), { kind: "in", by: "kept-words", cause: "reset-by-unapproved" })).toBe("app")
        expect(route(mismatch("approval-key", 1, 1), { kind: "in", by: "kept-words", cause: "unknown-change" })).toBe("app")
    })

    it("sends a device that is out with words that no longer give the key to the reset page", () => {
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
    const decide = (device: ReturnType<typeof historyDevice>) => gateDecisionUseCase(device.deps)(IDP, device.token, ACTOR)

    async function startOverElsewhere(idp: FakeHistoryIdp) {
        const other = historyDevice(idp, "elsewhere")
        await nameSession(other)
        await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey(2)).key)
    }

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

    it("keeps the device in the app, under a banner, once its key changes under the same generation or a device it never approved starts over", async () => {
        const { idp, laptop } = await account()
        const held = idp.key!

        idp.key = { ...held, approvalPublicKey: ed25519.keygen().publicKey }
        expect(await decide(laptop)).toEqual({ route: "app", reset: { cause: "unknown-change", setter: null }, offline: false })
        expect(resetCause(await laptop.e2ee.historyKeyStanding())).toBe("unknown-change")

        idp.key = held
        expect(await decide(laptop)).toEqual({ route: "app", reset: null, offline: false })

        const other = historyDevice(idp, "elsewhere")
        await nameSession(other)
        await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey(2)).key)
        expect(await decide(laptop)).toEqual({ route: "app", reset: { cause: "reset-by-unapproved", setter: other.storage.deviceId }, offline: false })
        expect(resetCause(await laptop.e2ee.historyKeyStanding())).toBe("newer-generation")
    })

    it("takes a generation said to be its own, while it set none, for a change none of its devices made", async () => {
        const { idp, laptop } = await account()
        await idp.setKey(IDP, laptop.token, { ...(await historyDevice(idp, "minted").e2ee.mintHistoryKey(2)).key })

        expect(idp.key?.setByDevice).toBe(laptop.storage.deviceId)
        expect(await decide(laptop)).toEqual({ route: "app", reset: { cause: "unknown-change", setter: null }, offline: false })
    })

    it("sends the device to the reset page once a device it found approved replaced its words", async () => {
        const { idp, laptop } = await account()
        const other = historyDevice(idp, "elsewhere")
        laptop.storage.trust = withTrust(laptop.storage.trust, {
            approved: [{ deviceId: other.storage.deviceId, rootKey: other.storage.rootKey.publicKey }],
        })
        const listed = [{ ...listedRow(other.storage.deviceId), drk_public_key: other.storage.rootKey.publicKey }]
        const seeing = { ...laptop.deps, deviceDirectoryPort: { ...laptop.deps.deviceDirectoryPort, listDevices: async () => ({ devices: listed }) } }
        await nameSession(other)
        await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey(2)).key)

        expect(await gateDecisionUseCase(seeing)(IDP, laptop.token, ACTOR)).toEqual({ route: "reset", reset: null, offline: false })
    })

    it("out of reach, lets in, under its banner, a device its kept words let in", async () => {
        const { idp, laptop } = await account()
        await startOverElsewhere(idp)
        expect(await decide(laptop)).toMatchObject({ route: "app", reset: { cause: "reset-by-unapproved" }, offline: false })
        vi.spyOn(idp, "getKey").mockRejectedValue(new TypeError("Failed to fetch"))

        expect(await decide(historyDevice(idp, "laptop", laptop.storage))).toMatchObject({ route: "app", reset: { cause: "reset-by-unapproved" }, offline: true })
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
