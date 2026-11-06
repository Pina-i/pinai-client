/**
 * A session and its device: where each device stands in Settings → Devices, and telling the IdP
 * which device this session signed in, proving it holds the device's root key.
 */
import { describe, expect, it, vi } from "vitest"

import { type DeviceListEntry, deviceStatus } from "@pinai/domain/models/device"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { ISessionPort } from "@pinai/domain/ports/session.port"
import { linkSessionDeviceUseCase } from "@pinai/domain/usecases/auth/link-session-device.usecase"
import { asActorUri } from "@pinai/domain/models/identity"
import { IdpError, isDeviceProofInvalid } from "@pinai/domain/models/idp-error"
import { sessionIdOf } from "@pinai/domain/models/auth"

import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import { nameSessionDeviceUseCase } from "@pinai/domain/usecases/auth/name-session-device.usecase"

import { accessToken } from "./setup/access-token"
import { ACTOR, FakeHistoryIdp, FastSealer, IDP, MemoryHistoryStorage } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"

function entry(change: Partial<DeviceListEntry>): DeviceListEntry {
    return {
        device_id: "d1",
        display_name: "Firefox on Linux",
        kind: "laptop",
        paired_at: "2026-10-01T09:00:00Z",
        last_seen_at: "2026-10-19T09:00:00Z",
        revoked_at: null,
        signed_in: false,
        last_active_at: null,
        drk_public_key: null,
        attestation_signature: null,
        attestation_kid: null,
        attestation_expires_at: null,
        hpke_public_key: null,
        hpke_key_signature: null,
        history_generation: null,
        approvals: [],
        ...change,
    }
}

describe("deviceStatus", () => {
    it("is signed in, active when its session was last used", () => {
        expect(deviceStatus(entry({ signed_in: true, last_active_at: "2026-10-20T08:00:00Z" }))).toEqual({
            kind: "signed-in",
            lastActiveAt: "2026-10-20T08:00:00Z",
        })
    })

    it("is signed out without a live session, and may sign in again", () => {
        expect(deviceStatus(entry({}))).toEqual({ kind: "signed-out" })
    })

    it("is revoked once revoked, whatever its sessions say", () => {
        expect(deviceStatus(entry({ revoked_at: "2026-10-20T10:00:00Z", signed_in: true }))).toEqual({
            kind: "revoked",
            at: "2026-10-20T10:00:00Z",
        })
    })
})

describe("linkSessionDeviceUseCase", () => {
    const ME = asActorUri("https://idp.example/users/alice")
    const SID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
    const TOKEN = accessToken(Date.now(), "alice", Date.now(), SID.toUpperCase())
    const PROOF = new Uint8Array(64).fill(7)

    function ports(
        hasIdentity: boolean,
        registerDevice = vi.fn<IE2eePort["registerDevice"]>(async () => {}),
        linked: ISessionPort["linkDevice"] = async () => undefined,
    ) {
        const order: string[] = []
        const linkDevice = vi.fn<ISessionPort["linkDevice"]>(async (...args) => {
            order.push("link")
            return linked(...args)
        })
        const sessionPort: ISessionPort = { linkDevice, signOutOtherDevices: vi.fn() }
        const e2eePort = {
            hasLocalIdentity: async () => hasIdentity,
            getDeviceId: async () => "this-device",
            signSessionDevice: vi.fn<IE2eePort["signSessionDevice"]>(async () => PROOF),
            registerDevice: vi.fn<IE2eePort["registerDevice"]>(async (...args) => {
                order.push(args[3]?.again ? "register again" : "register")
                return registerDevice(...args)
            }),
        } as unknown as IE2eePort
        return { sessionPort, e2eePort, linkDevice, order }
    }

    it("registers the device again when it has to, then names it to the IdP with its proof over the token's session", async () => {
        const { linkDevice, order, ...deps } = ports(true)

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", TOKEN, ME)).toEqual({ linked: true })
        expect(deps.e2eePort.registerDevice).toHaveBeenCalledWith("https://idp.example", TOKEN, ME)
        expect(deps.e2eePort.signSessionDevice).toHaveBeenCalledWith(ME, "this-device", SID)
        expect(linkDevice).toHaveBeenCalledWith("https://idp.example", TOKEN, "this-device", PROOF)
        expect(order).toEqual(["register", "link"])
    })

    it("names the device all the same when the registration fails another way, and says why", async () => {
        const unavailable = new IdpError(503, "", "Service unavailable")
        const { linkDevice, order: _order, ...deps } = ports(true, vi.fn(async () => Promise.reject(unavailable)))

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", TOKEN, ME)).toEqual({
            linked: true,
            registrationFailure: unavailable,
        })
        expect(linkDevice).toHaveBeenCalledWith("https://idp.example", TOKEN, "this-device", PROOF)
    })

    it("names nothing when the session names another device", async () => {
        const mismatch = new IdpError(403, "device_mismatch", "This session signed in another device")
        const { linkDevice, order: _order, ...deps } = ports(true, vi.fn(async () => Promise.reject(mismatch)))

        await expect(linkSessionDeviceUseCase(deps)("https://idp.example", TOKEN, ME)).rejects.toBe(mismatch)
        expect(linkDevice).not.toHaveBeenCalled()
    })

    it("waits for the device a first sign-in's onboarding creates", async () => {
        const { linkDevice, order: _order, ...deps } = ports(false)

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", TOKEN, ME)).toEqual({ linked: false })
        expect(deps.e2eePort.registerDevice).not.toHaveBeenCalled()
        expect(linkDevice).not.toHaveBeenCalled()
    })

    it("registers again and names the device once more when the IdP refuses the proof", async () => {
        const refused = new IdpError(403, "device_proof_invalid", "The signature does not prove this device's root key")
        const linked = vi.fn<ISessionPort["linkDevice"]>().mockRejectedValueOnce(refused).mockResolvedValueOnce(undefined)
        const { order, ...deps } = ports(true, undefined, linked)

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", TOKEN, ME)).toEqual({ linked: true })
        expect(order).toEqual(["register", "link", "register again", "link"])
        expect(deps.e2eePort.registerDevice).toHaveBeenLastCalledWith("https://idp.example", TOKEN, ME, { again: true })
    })

    it("throws a second refusal of the proof in plain words, without trying again", async () => {
        const refused = new IdpError(403, "device_proof_invalid", "The signature does not prove this device's root key")
        const { order, ...deps } = ports(true, undefined, async () => Promise.reject(refused))

        const thrown = await linkSessionDeviceUseCase(deps)("https://idp.example", TOKEN, ME).catch((e: unknown) => e)
        expect(isDeviceProofInvalid(thrown)).toBe(true)
        expect((thrown as Error).message).toBe("Your instance didn't recognise this device, so it can't be set up here.")
        expect(order).toEqual(["register", "link", "register again", "link"])
    })

    it("names nothing from a token that names no session", async () => {
        const { linkDevice, order: _order, ...deps } = ports(true)

        await expect(linkSessionDeviceUseCase(deps)("https://idp.example", "not-a-token", ME)).rejects.toThrow(/names no session/)
        expect(linkDevice).not.toHaveBeenCalled()
    })
})

describe("naming a device whose root key the IdP lost, on the real engine", () => {
    it("registers the same root key again — a fresh attestation or not — and the session ends up named", async () => {
        const issuers = new FakeIssuers()
        const idp = new FakeHistoryIdp()
        const storage = new MemoryHistoryStorage()
        storage.attested = issuers.attest(ACTOR, storage.deviceId, storage.rootKey.publicKey)
        const rootKey = storage.rootKey.publicKey
        const registered: Uint8Array[] = []
        const directory = {
            registerDevice: async (_idpUrl: string, _token: string, deviceId: string, drk: Uint8Array) => {
                registered.push(drk)
                idp.rootKeys.set(deviceId, drk)
                return issuers.attest(ACTOR, deviceId, drk)
            },
        }
        const e2ee = new E2eeAdapter({} as never, {} as never, storage.asStorage(), directory as never, {} as never, issuers.jwks, idp, new FastSealer())
        const token = accessToken(Date.now())
        expect(idp.rootKeys.has(storage.deviceId)).toBe(false)

        await nameSessionDeviceUseCase({ e2eePort: e2ee, sessionPort: idp.session() })(IDP, token, ACTOR)

        expect(registered).toHaveLength(1)
        expect(registered[0]).toEqual(rootKey)
        expect(storage.rootKey.publicKey).toEqual(rootKey)
        expect(idp.named.get(token)).toBe(storage.deviceId)
    })

    it("sends an `again` registration after one in flight that sent nothing", async () => {
        const issuers = new FakeIssuers()
        const storage = new MemoryHistoryStorage()
        storage.attested = issuers.attest(ACTOR, storage.deviceId, storage.rootKey.publicKey)
        const registerDevice = vi.fn(async (_idpUrl: string, _token: string, deviceId: string, drk: Uint8Array) => issuers.attest(ACTOR, deviceId, drk))
        const e2ee = new E2eeAdapter({} as never, {} as never, storage.asStorage(), { registerDevice } as never, {} as never, issuers.jwks)

        await Promise.all([e2ee.registerDevice(IDP, "tok", ACTOR), e2ee.registerDevice(IDP, "tok", ACTOR, { again: true })])
        expect(registerDevice).toHaveBeenCalledOnce()
    })
})

describe("sessionIdOf", () => {
    it("reads the session a token belongs to, lowercased, and none from a token without one", () => {
        expect(sessionIdOf(accessToken(Date.now(), "alice", Date.now(), "6BA7B810-9DAD-11D1-80B4-00C04FD430C8"))).toBe(
            "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        )
        expect(sessionIdOf("a.b.c")).toBeNull()
    })
})
