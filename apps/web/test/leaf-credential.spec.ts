/**
 * The leaf credential's wire shape.
 *
 * These bytes sit inside the BasicCredential of our leaf in the ratchet tree
 * and every peer decodes them to learn which device owns which leaf — which
 * is how device revocation finds the leaf to remove. A native engine built
 * from the same Rust crate has to produce and accept exactly this, so the
 * encoding is pinned here rather than left to whatever `JSON.stringify`
 * happens to do.
 */
import { describe, expect, it } from "vitest"

import {
    decodeLeafCredential,
    encodeLeafCredential,
    type LeafCredential,
} from "@pinai/mls/leaf-credential"
import { asActorUri } from "@pinai/domain/models/identity"

const CREDENTIAL: LeafCredential = {
    actor_uri: asActorUri("https://idp.example/users/alice"),
    device_id: "11112222-3333-4444-5555-666677778888",
}

describe("leaf credential", () => {
    it("encodes as UTF-8 JSON with actor_uri first", () => {
        expect(new TextDecoder().decode(encodeLeafCredential(CREDENTIAL))).toBe(
            '{"actor_uri":"https://idp.example/users/alice","device_id":"11112222-3333-4444-5555-666677778888"}',
        )
    })

    it("round-trips", () => {
        expect(decodeLeafCredential(encodeLeafCredential(CREDENTIAL))).toEqual(CREDENTIAL)
    })

    it("returns null rather than throwing on bytes that are not a credential", () => {
        expect(decodeLeafCredential(new TextEncoder().encode("not json"))).toBeNull()
        expect(decodeLeafCredential(new Uint8Array([0xff, 0xfe]))).toBeNull()
    })

    it("rejects a credential missing either field", () => {
        expect(decodeLeafCredential(new TextEncoder().encode('{"actor_uri":"x"}'))).toBeNull()
        expect(decodeLeafCredential(new TextEncoder().encode('{"device_id":"x"}'))).toBeNull()
    })
})
