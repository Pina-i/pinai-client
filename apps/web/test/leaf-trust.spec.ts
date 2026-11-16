/** What a device decides of a leaf once its checks ran (`identity-provider/specs/e2ee.md § 3.4`). */
import { describe, expect, it } from "vitest"

import { asActorUri } from "@pinai/domain/models/identity"
import {
    admitsClaim,
    leafApprovals,
    leafOrigin,
    sameCredential,
    untrustedLeaf,
    type LeafCredential,
    type LeafVerdict,
} from "@pinai/domain/models/leaf-trust"

const DAN = asActorUri("https://idp.dan.test/users/dan_k2m9x")
const TRUSTED: LeafVerdict = { ok: true, actorUri: DAN, deviceId: "dan-1", rootKey: new Uint8Array(32) }
const CREDENTIAL: LeafCredential = {
    v: 2,
    actor_uri: DAN,
    device_id: "dan-1",
    drk_pub: "root",
    idp_att: { issuer: "https://idp.dan.test", kid: "k", expires_at: "2027-05-14T12:00:00Z", signature: "att" },
    leaf_binding: "binding",
}

describe("admitsClaim", () => {
    it("adds a KeyPackage whose leaf verifies as the device it was claimed for", () => {
        expect(admitsClaim(TRUSTED, DAN, "dan-1")).toBe(TRUSTED)
    })

    it("refuses one carrying another device's credential, or another account's", () => {
        expect(admitsClaim(TRUSTED, DAN, "dan-2")).toEqual({ ok: false, reason: "not-claimed-device" })
        expect(admitsClaim(TRUSTED, "https://idp.dan.test/users/eve_k2m9x", "dan-1")).toEqual({
            ok: false,
            reason: "not-claimed-device",
        })
    })

    it("keeps the reason a leaf failed its checks", () => {
        expect(admitsClaim({ ok: false, reason: "binding" }, DAN, "dan-1")).toEqual({ ok: false, reason: "binding" })
    })

    it("refuses a sibling's KeyPackage under another root key than the one it was approved over", () => {
        expect(admitsClaim(TRUSTED, DAN, "dan-1", new Uint8Array(32))).toBe(TRUSTED)
        expect(admitsClaim(TRUSTED, DAN, "dan-1", new Uint8Array(32).fill(1))).toEqual({ ok: false, reason: "not-claimed-device" })
    })
})

describe("leafOrigin", () => {
    it("calls forged only a leaf a check shows isn't the device it names", () => {
        expect(leafOrigin(TRUSTED)).toBe("verified")
        for (const reason of ["malformed", "issuer-mismatch", "attestation", "binding"] as const) {
            expect(leafOrigin({ ok: false, reason })).toBe("forged")
        }
        expect(leafOrigin({ ok: false, reason: "unreachable" })).toBe("unsettled")
        expect(leafOrigin({ ok: false, reason: "expired" })).toBe("unsettled")
    })
})

describe("sameCredential", () => {
    it("is every field the same", () => {
        expect(sameCredential({ ...CREDENTIAL, idp_att: { ...CREDENTIAL.idp_att } }, CREDENTIAL)).toBe(true)
    })

    it("tells a renewed attestation, another binding, or no credential at all", () => {
        const renewed = { ...CREDENTIAL, idp_att: { ...CREDENTIAL.idp_att, expires_at: "2028-05-14T12:00:00Z" } }
        expect(sameCredential(renewed, CREDENTIAL)).toBe(false)
        expect(sameCredential({ ...CREDENTIAL, leaf_binding: "other" }, CREDENTIAL)).toBe(false)
        expect(sameCredential(null, CREDENTIAL)).toBe(false)
    })

    it("tells approvals gained, lost or changed, and takes none and an empty list as the same", () => {
        const words = { by: "passphrase", generation: 1, approval_public_key: "key", signature: "w" } as const
        const partner = { by: "device", device_id: "dan-2", signature: "p" } as const
        const approved = { ...CREDENTIAL, approvals: [words, partner] }

        expect(sameCredential({ ...CREDENTIAL, approvals: [] }, CREDENTIAL)).toBe(true)
        expect(sameCredential({ ...approved, approvals: [{ ...words }, { ...partner }] }, approved)).toBe(true)
        expect(sameCredential(CREDENTIAL, approved)).toBe(false)
        expect(sameCredential(approved, { ...CREDENTIAL, approvals: [partner] })).toBe(false)
        expect(sameCredential({ ...approved, approvals: [{ ...words, generation: 2 }, partner] }, approved)).toBe(false)
        expect(sameCredential({ ...approved, approvals: [{ ...words, approval_public_key: "other" }, partner] }, approved)).toBe(false)
        expect(sameCredential({ ...approved, approvals: [words, { ...partner, device_id: "dan-3" }] }, approved)).toBe(false)
        expect(sameCredential({ ...approved, approvals: [words, { ...partner, signature: "q" }] }, approved)).toBe(false)
    })
})

describe("leafApprovals", () => {
    const words = { generation: 2, approval_public_key: "key", signature: "w" }

    it("puts the words' approval first, then its partners' by device id, each once", () => {
        const partners = [
            { device_id: "dan-3", signature: "b" },
            { device_id: "dan-2", signature: "c" },
            { device_id: "dan-3", signature: "a" },
            { device_id: "dan-2", signature: "c" },
        ]

        expect(leafApprovals(words, partners)).toEqual([
            { by: "passphrase", ...words },
            { by: "device", device_id: "dan-2", signature: "c" },
            { by: "device", device_id: "dan-3", signature: "a" },
            { by: "device", device_id: "dan-3", signature: "b" },
        ])
        expect(leafApprovals(words, [...partners].reverse())).toEqual(leafApprovals(words, partners))
    })

    it("carries what there is: no words, no partner, nothing", () => {
        expect(leafApprovals(null, [{ device_id: "dan-2", signature: "c" }])).toEqual([{ by: "device", device_id: "dan-2", signature: "c" }])
        expect(leafApprovals(words, [])).toEqual([{ by: "passphrase", ...words }])
        expect(leafApprovals(null, [])).toEqual([])
    })
})

describe("untrustedLeaf", () => {
    it("names whom the leaf claims, when its credential says", () => {
        const key = new Uint8Array(32).fill(1)
        expect(untrustedLeaf("c1", { leafIndex: 3, own: false, signatureKey: key, credential: CREDENTIAL }, "binding")).toEqual({
            conversationId: "c1",
            leafIndex: 3,
            signatureKey: key,
            actorUri: DAN,
            deviceId: "dan-1",
            reason: "binding",
        })
        expect(untrustedLeaf("c1", { leafIndex: 4, own: false, signatureKey: key, credential: null }, "malformed")).toMatchObject({
            actorUri: null,
            deviceId: null,
        })
    })
})
