/**
 * The leaf credential's wire shape.
 *
 * These bytes sit inside the BasicCredential of our leaf in the ratchet tree and every peer
 * decodes them to learn which device owns which leaf, and to check its root key bound the leaf's
 * key. A native engine built from the same Rust crate has to produce and accept exactly this, so
 * the encoding is pinned here rather than left to whatever `JSON.stringify` happens to do.
 */
import { describe, expect, it } from "vitest"

import { decodeLeafCredential, encodeLeafCredential, type LeafCredential } from "@pinai/mls/leaf-credential"
import { asActorUri } from "@pinai/domain/models/identity"

const CREDENTIAL: LeafCredential = {
    v: 2,
    actor_uri: asActorUri("https://idp.alice.com/users/alice_xK9mP"),
    device_id: "550e8400-e29b-41d4-a716-446655440000",
    drk_pub: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    idp_att: {
        issuer: "https://idp.alice.com",
        kid: "key-2026-01",
        expires_at: "2027-05-14T12:00:00Z",
        signature: "c2lnbmF0dXJl",
    },
    leaf_binding: "YmluZGluZw==",
}

const utf8 = (s: string) => new TextEncoder().encode(s)

describe("leaf credential", () => {
    it("encodes as UTF-8 JSON, its fields in the spec's order", () => {
        expect(new TextDecoder().decode(encodeLeafCredential(CREDENTIAL))).toBe(
            '{"v":2,"actor_uri":"https://idp.alice.com/users/alice_xK9mP",' +
                '"device_id":"550e8400-e29b-41d4-a716-446655440000",' +
                '"drk_pub":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",' +
                '"idp_att":{"issuer":"https://idp.alice.com","kid":"key-2026-01",' +
                '"expires_at":"2027-05-14T12:00:00Z","signature":"c2lnbmF0dXJl"},' +
                '"leaf_binding":"YmluZGluZw=="}',
        )
    })

    it("writes the same bytes whatever order the fields came in", () => {
        const shuffled = {
            leaf_binding: CREDENTIAL.leaf_binding,
            idp_att: {
                signature: CREDENTIAL.idp_att.signature,
                expires_at: CREDENTIAL.idp_att.expires_at,
                kid: CREDENTIAL.idp_att.kid,
                issuer: CREDENTIAL.idp_att.issuer,
            },
            drk_pub: CREDENTIAL.drk_pub,
            device_id: CREDENTIAL.device_id,
            actor_uri: CREDENTIAL.actor_uri,
            v: 2,
        } as LeafCredential

        expect(encodeLeafCredential(shuffled)).toEqual(encodeLeafCredential(CREDENTIAL))
    })

    it("round-trips", () => {
        expect(decodeLeafCredential(encodeLeafCredential(CREDENTIAL))).toEqual(CREDENTIAL)
    })

    it("returns null rather than throwing on bytes that are not a credential", () => {
        expect(decodeLeafCredential(utf8("not json"))).toBeNull()
        expect(decodeLeafCredential(new Uint8Array([0xff, 0xfe]))).toBeNull()
        expect(decodeLeafCredential(utf8("[2]"))).toBeNull()
    })

    it("reads no credential of another version, the first one's included", () => {
        expect(decodeLeafCredential(utf8('{"actor_uri":"x","device_id":"y"}'))).toBeNull()
        const v1 = JSON.stringify({ ...CREDENTIAL, v: 1 })
        expect(decodeLeafCredential(utf8(v1))).toBeNull()
    })

    it("rejects a credential missing a field", () => {
        const { leaf_binding: _binding, ...unbound } = CREDENTIAL
        expect(decodeLeafCredential(utf8(JSON.stringify(unbound)))).toBeNull()
        const noKid = { ...CREDENTIAL, idp_att: { ...CREDENTIAL.idp_att, kid: 7 } }
        expect(decodeLeafCredential(utf8(JSON.stringify(noKid)))).toBeNull()
    })
})
