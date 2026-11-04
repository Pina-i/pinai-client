import { describe, expect, it, vi } from "vitest"

import { asActorUri } from "@pinai/domain/models/identity"

import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { IHpkePort } from "@pinai/domain/ports/hpke.port"
import type { IKeyDirectoryPort } from "@pinai/domain/ports/key-directory.port"
import { IdpError } from "@pinai/domain/models/idp-error"
import { registerDeviceUseCase } from "@pinai/domain/usecases/e2ee/register-device.usecase"
import { replenishKeyPackagesUseCase } from "@pinai/domain/usecases/e2ee/replenish-keypackages.usecase"
import { verifyStrict } from "@pinai/crypto/attestation-chain.adapter"
import { deviceHpkeKeyBytes } from "@pinai/crypto/canonical-bytes"
import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import type { DeviceAttestation, E2eeStorage } from "@pinai/crypto/sealed-storage"

import { FakeIssuers, wholeSeconds } from "./setup/issuers"

describe("registerDeviceUseCase", () => {
    it("delegates to e2eePort.registerDevice with the right args", async () => {
        const port = {
            registerDevice: vi.fn().mockResolvedValue(undefined),
        } as unknown as IE2eePort
        await registerDeviceUseCase({ e2eePort: port })({
            idpUrl: "https://idp.alice.com",
            accessToken: "tok",
            actorUri: asActorUri("https://idp.alice.com/users/alice"),
        })
        expect(port.registerDevice).toHaveBeenCalledWith(
            "https://idp.alice.com",
            "tok",
            "https://idp.alice.com/users/alice",
        )
    })

    it("propagates port errors", async () => {
        const port = {
            registerDevice: vi.fn().mockRejectedValue(new Error("attestation failed")),
        } as unknown as IE2eePort
        await expect(
            registerDeviceUseCase({ e2eePort: port })({
                idpUrl: "https://idp.alice.com",
                accessToken: "tok",
                actorUri: asActorUri("https://idp.alice.com/users/alice"),
            }),
        ).rejects.toThrow("attestation failed")
    })
})

describe("E2eeAdapter.registerDevice", () => {
    const ME = asActorUri("https://idp.alice.com/users/alice_xK9mP")
    const DEVICE = "550e8400-e29b-41d4-a716-446655440000"

    function device(stored: DeviceAttestation | null = null) {
        const issuers = new FakeIssuers()
        let attestation = stored
        const storage = {
            getOrCreateDeviceId: async () => DEVICE,
            loadDeviceAttestation: async () => attestation,
            saveDeviceAttestation: vi.fn(async (next: DeviceAttestation) => void (attestation = next)),
        } as unknown as E2eeStorage
        const directory = {
            registerDevice: vi.fn<IKeyDirectoryPort["registerDevice"]>(async (_idp, _token, deviceId, rootKey) =>
                issuers.attest(ME, deviceId, rootKey),
            ),
        } as unknown as IKeyDirectoryPort & { registerDevice: ReturnType<typeof vi.fn> }
        const hpkeKey = { publicKey: new Uint8Array(32).fill(5), privateKey: new Uint8Array(32).fill(6) }
        const hpke = { generateKeyPair: vi.fn(async () => hpkeKey) } as unknown as IHpkePort
        const e2ee = new E2eeAdapter({} as never, {} as never, storage, directory, hpke, issuers.jwks)
        return { e2ee, directory, hpke, hpkeKey, issuers, stored: () => attestation }
    }

    it("makes a root key and an HPKE key on a new device, the HPKE key signed by the root key", async () => {
        const { e2ee, directory, hpkeKey, stored } = device()

        await e2ee.registerDevice("https://idp.alice.com", "tok", ME)

        const [, , deviceId, rootKey, sent] = directory.registerDevice.mock.calls[0]
        expect(deviceId).toBe(DEVICE)
        expect(sent.publicKey).toEqual(hpkeKey.publicKey)
        expect(verifyStrict(sent.signature, deviceHpkeKeyBytes(ME, DEVICE, hpkeKey.publicKey), rootKey)).toBe(true)
        expect(stored()).toMatchObject({
            drk_public: rootKey,
            hpke: { public_key: hpkeKey.publicKey, private_key: hpkeKey.privateKey },
        })
    })

    it("registers a device without an HPKE key again at once, with its root key, whatever its expiry", async () => {
        const first = device()
        await first.e2ee.registerDevice("https://idp.alice.com", "tok", ME)
        const before = { ...first.stored()!, hpke: null }
        const { e2ee, directory, hpke } = device(before)

        await e2ee.registerDevice("https://idp.alice.com", "tok", ME)

        expect(hpke.generateKeyPair).toHaveBeenCalledTimes(1)
        expect(directory.registerDevice.mock.calls[0][3]).toEqual(before.drk_public)
    })

    it("leaves a device holding its HPKE key and a fresh attestation alone", async () => {
        const first = device()
        await first.e2ee.registerDevice("https://idp.alice.com", "tok", ME)
        const { e2ee, directory } = device(first.stored())

        await e2ee.registerDevice("https://idp.alice.com", "tok", ME)

        expect(directory.registerDevice).not.toHaveBeenCalled()
    })

    it("renews near the attestation's end with the keys it holds", async () => {
        const first = device()
        await first.e2ee.registerDevice("https://idp.alice.com", "tok", ME)
        const ending = { ...first.stored()!, expires_at: wholeSeconds(new Date(Date.now() + 86_400_000)) }
        const { e2ee, directory, hpke } = device(ending)

        await e2ee.registerDevice("https://idp.alice.com", "tok", ME)

        expect(hpke.generateKeyPair).not.toHaveBeenCalled()
        const [, , , rootKey, sent] = directory.registerDevice.mock.calls[0]
        expect(rootKey).toEqual(ending.drk_public)
        expect(sent.publicKey).toEqual(ending.hpke!.public_key)
    })

    it("keeps no attestation whose signed text isn't its root key's and expiry's", async () => {
        const { e2ee, directory, stored } = device()
        directory.registerDevice.mockImplementationOnce(async (_i: string, _t: string, deviceId: string, rootKey: Uint8Array) => ({
            ...new FakeIssuers().attest(ME, deviceId, rootKey),
            expires_at: "2027-05-14T12:00:00.123Z",
        }))

        await expect(e2ee.registerDevice("https://idp.alice.com", "tok", ME)).rejects.toThrow(/attestation/)
        expect(stored()).toBeNull()
    })

    it("keeps nothing when the session names another device", async () => {
        const { e2ee, directory, stored } = device()
        directory.registerDevice.mockRejectedValueOnce(new IdpError(403, "device_mismatch", "This session signed in another device"))

        await expect(e2ee.registerDevice("https://idp.alice.com", "tok", ME)).rejects.toMatchObject({ code: "device_mismatch" })
        expect(stored()).toBeNull()
    })
})

describe("replenishKeyPackagesUseCase", () => {
    const input = {
        idpUrl: "https://idp.alice.com",
        accessToken: "tok",
        actorUri: asActorUri("https://idp.alice.com/users/alice"),
    }
    const STATUS = { devices: [], refill_threshold: 20, cap: 100 }

    it("renews the attestation when due before it tops the stash up", async () => {
        const order: string[] = []
        const port = {
            registerDevice: vi.fn(async () => void order.push("renew")),
            replenishKeyPackages: vi.fn(async () => (order.push("refill"), STATUS)),
        } as unknown as IE2eePort

        expect(await replenishKeyPackagesUseCase({ e2eePort: port })(input)).toEqual({ status: STATUS })
        expect(order).toEqual(["renew", "refill"])
    })

    it("tops the stash up all the same when the renewal fails, and says why", async () => {
        const failure = new IdpError(503, "", "Service unavailable")
        const port = {
            registerDevice: vi.fn(async () => Promise.reject(failure)),
            replenishKeyPackages: vi.fn(async () => STATUS),
        } as unknown as IE2eePort

        expect(await replenishKeyPackagesUseCase({ e2eePort: port })(input)).toEqual({
            status: STATUS,
            renewalFailure: failure,
        })
    })
})
