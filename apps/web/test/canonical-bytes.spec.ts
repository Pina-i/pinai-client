/**
 * The canonical signed bytes of `identity-provider/specs/e2ee.md § 7.2`. The first two vectors
 * are the IdP's own (its domain and attestation tests): the bytes a device rebuilds must be the
 * very bytes the IdP signs and checks. A change here needs a new tag.
 */
import { describe, expect, it } from "vitest"

import { attestationBytes, deviceHpkeKeyBytes, leafBindingBytes } from "@pinai/crypto/canonical-bytes"

const ACTOR = "https://idp.alice.com/users/alice_xK9mP"
const DEVICE = "550e8400-e29b-41d4-a716-446655440000"
const ZEROS = new Uint8Array(32)
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe("canonical signed bytes", () => {
    it("writes the IdP's attestation of a root key as the IdP signs it", () => {
        expect(text(attestationBytes(ACTOR, DEVICE, ZEROS, "2027-05-14T00:00:00Z", "key-2026-01"))).toBe(
            "IDP-ATTEST-v1\n" +
                "https://idp.alice.com/users/alice_xK9mP\n" +
                "550e8400-e29b-41d4-a716-446655440000\n" +
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n" +
                "2027-05-14T00:00:00Z\n" +
                "key-2026-01",
        )
    })

    it("writes a root key's signature over its HPKE key as the IdP checks it", () => {
        expect(text(deviceHpkeKeyBytes(ACTOR, DEVICE, ZEROS))).toBe(
            "PINAI-DEVICE-HPKE-v1\n" +
                "https://idp.alice.com/users/alice_xK9mP\n" +
                "550e8400-e29b-41d4-a716-446655440000\n" +
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        )
    })

    it("writes a root key's binding of a leaf signature key", () => {
        expect(text(leafBindingBytes(ACTOR, DEVICE, new Uint8Array(32).fill(0xff)))).toBe(
            "PINAI-LEAF-BINDING-v1\n" +
                "https://idp.alice.com/users/alice_xK9mP\n" +
                "550e8400-e29b-41d4-a716-446655440000\n" +
                "//////////////////////////////////////////8=",
        )
    })
})
