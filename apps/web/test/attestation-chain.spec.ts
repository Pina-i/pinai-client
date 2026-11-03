/**
 * The chains a device checks itself: a leaf's credential (`identity-provider/specs/e2ee.md
 * § 3.4`) — the instance's attestation of the root key, and the root key's binding of the leaf's
 * key —, and a listed device's root key and HPKE key (§ 3.3).
 */
import { describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { verifyDeviceChain, verifyLeafCredential } from "@pinai/crypto/attestation-chain.adapter"
import { deviceHpkeKeyBytes } from "@pinai/crypto/canonical-bytes"
import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { asActorUri } from "@pinai/domain/models/identity"
import type { LeafClaim, LeafCredential } from "@pinai/domain/models/leaf-trust"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"

import { FakeIssuers, KID, credentialFor, testDevice, wholeSeconds } from "./setup/issuers"

const ALICE = asActorUri("https://idp.alice.com/users/alice_xK9mP")
const MALLORY = asActorUri("https://idp.alice.com/users/mallory_k2m9x")

function setup() {
    const issuers = new FakeIssuers()
    const device = testDevice(issuers, ALICE, "550e8400-e29b-41d4-a716-446655440000")
    const leafKey = ed25519.keygen().publicKey
    const leaf = (change: Partial<LeafCredential> = {}, signatureKey = leafKey): LeafClaim => ({
        credential: { ...credentialFor(device, signatureKey), ...change },
        signatureKey,
    })
    return { issuers, device, leafKey, leaf }
}

describe("verifyLeafCredential", () => {
    it("trusts a leaf whose root key its instance attests, and which that key bound", async () => {
        const { issuers, device, leaf } = setup()

        const verdict = await verifyLeafCredential(leaf(), issuers.jwks)

        expect(verdict).toEqual({ ok: true, actorUri: ALICE, deviceId: device.deviceId, rootKey: device.rootKey.publicKey })
    })

    it("refuses what isn't a v2 credential", async () => {
        const { issuers, leafKey } = setup()

        expect(await verifyLeafCredential({ credential: null, signatureKey: leafKey }, issuers.jwks)).toEqual({
            ok: false,
            reason: "malformed",
        })
    })

    it("refuses an attestation by another instance than the actor's", async () => {
        const { issuers, leaf } = setup()
        const base = leaf().credential!

        const verdict = await verifyLeafCredential(
            leaf({ idp_att: { ...base.idp_att, issuer: "https://evil.example" } }),
            issuers.jwks,
        )

        expect(verdict).toEqual({ ok: false, reason: "issuer-mismatch" })
    })

    it("takes the issuer to be exactly the actor's origin, where its keys are fetched", async () => {
        const { issuers, leaf } = setup()
        const base = leaf().credential!

        for (const issuer of ["https://idp.alice.com/", "https://idp.alice.com/users", "https://IDP.alice.com"]) {
            expect(await verifyLeafCredential(leaf({ idp_att: { ...base.idp_att, issuer } }), issuers.jwks)).toEqual({
                ok: false,
                reason: "issuer-mismatch",
            })
        }
    })

    it("refuses an expired attestation, with five minutes of clock skew", async () => {
        const issuers = new FakeIssuers()
        const long = testDevice(issuers, ALICE)
        long.attestation = issuers.attest(ALICE, long.deviceId, long.rootKey.publicKey, wholeSeconds(new Date(Date.now() - 10 * 60_000)))
        const recent = testDevice(issuers, ALICE)
        recent.attestation = issuers.attest(ALICE, recent.deviceId, recent.rootKey.publicKey, wholeSeconds(new Date(Date.now() - 60_000)))
        const key = ed25519.keygen().publicKey

        expect(await verifyLeafCredential({ credential: credentialFor(long, key), signatureKey: key }, issuers.jwks)).toEqual({
            ok: false,
            reason: "expired",
        })
        expect((await verifyLeafCredential({ credential: credentialFor(recent, key), signatureKey: key }, issuers.jwks)).ok).toBe(true)
    })

    it("refuses an attestation another key signed, or over another root key", async () => {
        const { issuers, leaf } = setup()
        const base = leaf().credential!
        const otherKey = ed25519.keygen().publicKey

        expect(
            await verifyLeafCredential(
                leaf({ idp_att: { ...base.idp_att, signature: bytesToBase64(new Uint8Array(64)) } }),
                issuers.jwks,
            ),
        ).toEqual({ ok: false, reason: "attestation" })
        expect(await verifyLeafCredential(leaf({ drk_pub: bytesToBase64(otherKey) }), issuers.jwks)).toEqual({
            ok: false,
            reason: "attestation",
        })
        expect(await verifyLeafCredential(leaf({ actor_uri: MALLORY }), issuers.jwks)).toEqual({
            ok: false,
            reason: "attestation",
        })
    })

    it("refuses a credential paired with a leaf key its root key didn't bind", async () => {
        const { issuers, leaf } = setup()
        const instancesOwnKey = ed25519.keygen().publicKey

        const verdict = await verifyLeafCredential(
            { credential: leaf().credential, signatureKey: instancesOwnKey },
            issuers.jwks,
        )

        expect(verdict).toEqual({ ok: false, reason: "binding" })
    })

    it("tells an issuer out of reach from a bad attestation", async () => {
        const { leaf } = setup()
        const unreachable: IJwksCachePort = {
            getKey: vi.fn(async () => Promise.reject(new Error("JWKS fetch failed: 502"))),
            invalidate: vi.fn(),
        }

        expect(await verifyLeafCredential(leaf(), unreachable)).toEqual({ ok: false, reason: "unreachable" })
    })

    it("asks the issuer again once when the cached key doesn't verify, for a key rotated since", async () => {
        const { issuers, leaf } = setup()
        let calls = 0
        const rotated: IJwksCachePort = {
            getKey: vi.fn(async (issuer: string, kid: string) =>
                ++calls === 1 ? new Uint8Array(32).fill(7) : issuers.jwks.getKey(issuer, kid),
            ),
            invalidate: vi.fn(),
        }

        expect((await verifyLeafCredential(leaf(), rotated)).ok).toBe(true)
        expect(rotated.invalidate).toHaveBeenCalledTimes(1)
    })
})

describe("verifyDeviceChain", () => {
    function listed(change: Partial<DeviceListEntry> = {}) {
        const issuers = new FakeIssuers()
        const device = testDevice(issuers, ALICE)
        const hpkeKey = new Uint8Array(32).fill(9)
        const entry: DeviceListEntry = {
            device_id: device.deviceId,
            display_name: "Firefox on Linux",
            kind: "laptop",
            paired_at: "2026-11-01T09:00:00Z",
            last_seen_at: "2026-11-02T09:00:00Z",
            revoked_at: null,
            signed_in: true,
            last_active_at: "2026-11-02T09:00:00Z",
            drk_public_key: device.rootKey.publicKey,
            attestation_signature: device.attestation.signature,
            attestation_kid: KID,
            attestation_expires_at: device.attestation.expires_at,
            hpke_public_key: hpkeKey,
            hpke_key_signature: ed25519.sign(
                deviceHpkeKeyBytes(ALICE, device.deviceId, hpkeKey),
                device.rootKey.secretKey,
            ),
            history_generation: null,
            approvals: [],
            ...change,
        }
        return { issuers, device, hpkeKey, entry }
    }

    it("trusts an HPKE key its root key signed, the root key its instance attests", async () => {
        const { issuers, device, hpkeKey, entry } = listed()

        expect(await verifyDeviceChain(ALICE, entry, issuers.jwks)).toEqual({
            ok: true,
            deviceId: device.deviceId,
            rootKey: device.rootKey.publicKey,
            hpkePublicKey: hpkeKey,
        })
    })

    it("trusts nothing of a revoked device", async () => {
        const { issuers, entry } = listed({ revoked_at: "2026-11-02T10:00:00Z" })

        expect(await verifyDeviceChain(ALICE, entry, issuers.jwks)).toEqual({ ok: false, reason: "revoked" })
    })

    it("has nothing to trust of a device with no root key, or no HPKE key", async () => {
        const { issuers, entry } = listed()

        expect(await verifyDeviceChain(ALICE, { ...entry, drk_public_key: null }, issuers.jwks)).toEqual({
            ok: false,
            reason: "no-root-key",
        })
        expect(
            await verifyDeviceChain(ALICE, { ...entry, hpke_public_key: null, hpke_key_signature: null }, issuers.jwks),
        ).toEqual({ ok: false, reason: "no-hpke-key" })
    })

    it("refuses a root key its instance didn't attest for this device of this account", async () => {
        const { issuers, entry } = listed()

        expect(
            await verifyDeviceChain(ALICE, { ...entry, drk_public_key: ed25519.keygen().publicKey }, issuers.jwks),
        ).toEqual({ ok: false, reason: "attestation" })
        expect(await verifyDeviceChain(MALLORY, entry, issuers.jwks)).toEqual({ ok: false, reason: "attestation" })
        expect(await verifyDeviceChain(ALICE, { ...entry, device_id: crypto.randomUUID() }, issuers.jwks)).toEqual({
            ok: false,
            reason: "attestation",
        })
    })

    it("reads the expiry as a leaf's is read: past, five minutes of clock skew allowed", async () => {
        const at = async (ago: number) => {
            const issuers = new FakeIssuers()
            const device = testDevice(issuers, ALICE)
            const expiresAt = wholeSeconds(new Date(Date.now() - ago))
            const attestation = issuers.attest(ALICE, device.deviceId, device.rootKey.publicKey, expiresAt)
            const hpkeKey = new Uint8Array(32).fill(9)
            const { entry } = listed()
            return verifyDeviceChain(
                ALICE,
                {
                    ...entry,
                    device_id: device.deviceId,
                    drk_public_key: device.rootKey.publicKey,
                    attestation_signature: attestation.signature,
                    attestation_expires_at: expiresAt,
                    hpke_public_key: hpkeKey,
                    hpke_key_signature: ed25519.sign(
                        deviceHpkeKeyBytes(ALICE, device.deviceId, hpkeKey),
                        device.rootKey.secretKey,
                    ),
                },
                issuers.jwks,
            )
        }

        expect(await at(10 * 60_000)).toEqual({ ok: false, reason: "expired" })
        expect((await at(60_000)).ok).toBe(true)
    })

    it("refuses an HPKE key its root key didn't sign", async () => {
        const { issuers, entry } = listed()

        expect(
            await verifyDeviceChain(ALICE, { ...entry, hpke_public_key: new Uint8Array(32).fill(8) }, issuers.jwks),
        ).toEqual({ ok: false, reason: "hpke-signature" })
    })
})
