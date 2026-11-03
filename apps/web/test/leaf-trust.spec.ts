/** What a device decides of a leaf once its checks ran (`identity-provider/specs/e2ee.md § 3.4`). */
import { describe, expect, it } from "vitest"

import { asActorUri } from "@pinai/domain/models/identity"
import {
    admitsClaim,
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
