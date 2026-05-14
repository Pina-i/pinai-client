import { describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { verifyLeafCredential } from "@/adapters/e2ee/attestation-chain.adapter"
import type { JwksCacheAdapter } from "@/adapters/jwks/jwks-cache.adapter"
import { bytesToBase64 } from "@/presentation/_libs/utils-bytes"

function makeMockJwks(idpPub: Uint8Array, kid: string): JwksCacheAdapter {
    return {
        getKey: vi.fn(async (_iss: string, k: string) => (k === kid ? idpPub : null)),
        invalidate: vi.fn(),
    } as unknown as JwksCacheAdapter
}

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s)
}

function makeCredential(opts: {
    actorUri: string
    deviceId: string
    issuer: string
    kid: string
    expiresAt: string
    idpPriv: Uint8Array
    drkPriv: Uint8Array
    drkPub: Uint8Array
    leafPub: Uint8Array
    drkSigOverride?: Uint8Array
    idpSigOverride?: Uint8Array
}): Uint8Array {
    const drkMsg = utf8(`DRK-LEAF-v1\n${bytesToBase64(opts.leafPub)}`)
    const drkSig = opts.drkSigOverride ?? ed25519.sign(drkMsg, opts.drkPriv)

    const canonical = utf8(
        `IDP-ATTEST-v1\n${opts.actorUri}\n${opts.deviceId}\n${bytesToBase64(opts.drkPub)}\n${opts.expiresAt}\n${opts.kid}`,
    )
    const idpSig = opts.idpSigOverride ?? ed25519.sign(canonical, opts.idpPriv)

    const cred = {
        v: 1,
        actor_uri: opts.actorUri,
        device_id: opts.deviceId,
        leaf_pub: bytesToBase64(opts.leafPub),
        drk_pub: bytesToBase64(opts.drkPub),
        drk_sig: bytesToBase64(drkSig),
        idp_att: {
            issuer: opts.issuer,
            kid: opts.kid,
            expires_at: opts.expiresAt,
            signature: bytesToBase64(idpSig),
        },
    }
    return utf8(JSON.stringify(cred))
}

describe("verifyLeafCredential", () => {
    const idpKeys = ed25519.keygen()
    const idpPriv = idpKeys.secretKey
    const idpPub = idpKeys.publicKey
    const drkKeys = ed25519.keygen()
    const drkPriv = drkKeys.secretKey
    const drkPub = drkKeys.publicKey
    const leafPub = ed25519.keygen().publicKey

    const validOpts = {
        actorUri: "https://idp.alice.com/users/alice_xK9mP",
        deviceId: "550e8400-e29b-41d4-a716-446655440000",
        issuer: "https://idp.alice.com",
        kid: "key-2026-01",
        expiresAt: "2099-01-01T00:00:00Z",
        idpPriv,
        drkPriv,
        drkPub,
        leafPub,
    }

    it("accepts a well-formed credential", async () => {
        const bytes = makeCredential(validOpts)
        const jwks = makeMockJwks(idpPub, "key-2026-01")
        const result = await verifyLeafCredential(bytes, jwks)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.actorUri).toBe(validOpts.actorUri)
            expect(result.deviceId).toBe(validOpts.deviceId)
        }
    })

    it("rejects mismatched issuer/actor origin", async () => {
        const bytes = makeCredential({ ...validOpts, issuer: "https://evil.com" })
        const jwks = makeMockJwks(idpPub, "key-2026-01")
        const result = await verifyLeafCredential(bytes, jwks)
        expect(result.ok).toBe(false)
    })

    it("rejects expired attestation", async () => {
        const bytes = makeCredential({ ...validOpts, expiresAt: "2000-01-01T00:00:00Z" })
        const jwks = makeMockJwks(idpPub, "key-2026-01")
        const result = await verifyLeafCredential(bytes, jwks)
        expect(result.ok).toBe(false)
    })

    it("rejects unknown kid", async () => {
        const bytes = makeCredential(validOpts)
        const jwks = makeMockJwks(idpPub, "different-kid")
        const result = await verifyLeafCredential(bytes, jwks)
        expect(result.ok).toBe(false)
    })

    it("invalidates JWKS once on verify-fail then retries", async () => {
        const goodBytes = makeCredential(validOpts)
        let call = 0
        const jwks = {
            getKey: vi.fn(async () => {
                call += 1
                return call === 1 ? new Uint8Array(32) : idpPub
            }),
            invalidate: vi.fn(),
        } as unknown as JwksCacheAdapter
        const result = await verifyLeafCredential(goodBytes, jwks)
        expect(result.ok).toBe(true)
        expect(jwks.invalidate).toHaveBeenCalledTimes(1)
    })

    it("rejects bad DRK sig", async () => {
        const bytes = makeCredential({ ...validOpts, drkSigOverride: new Uint8Array(64) })
        const jwks = makeMockJwks(idpPub, "key-2026-01")
        const result = await verifyLeafCredential(bytes, jwks)
        expect(result.ok).toBe(false)
    })
})
