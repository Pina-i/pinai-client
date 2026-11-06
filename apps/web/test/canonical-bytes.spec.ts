/**
 * The canonical signed bytes of `identity-provider/specs/e2ee.md § 7.2`. The attestation, HPKE,
 * session naming and approval vectors are the IdP's own (its domain and attestation tests): the bytes a device
 * rebuilds must be the very bytes the IdP signs and checks. A change here needs a new tag.
 */
import { describe, expect, it } from "vitest"

import {
    approvalBytes,
    archiveEntryAad,
    attestationBytes,
    deviceHpkeKeyBytes,
    leafBindingBytes,
    sessionDeviceBytes,
} from "@pinai/crypto/canonical-bytes"

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

    it("writes what a root key signs to name its device on a session, as the IdP checks it", () => {
        expect(
            text(sessionDeviceBytes("https://idp.alice.test/users/alice_xk9mp", DEVICE, "6ba7b810-9dad-11d1-80b4-00c04fd430c8")),
        ).toBe(
            "PINAI-SESSION-DEVICE-v1\n" +
                "https://idp.alice.test/users/alice_xk9mp\n" +
                "550e8400-e29b-41d4-a716-446655440000\n" +
                "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        )
    })

    it("writes the device and the session lowercased, as the IdP writes UUIDs", () => {
        expect(text(sessionDeviceBytes(ACTOR, DEVICE.toUpperCase(), "6BA7B810-9DAD-11D1-80B4-00C04FD430C8"))).toBe(
            `PINAI-SESSION-DEVICE-v1\n${ACTOR}\n${DEVICE}\n6ba7b810-9dad-11d1-80b4-00c04fd430c8`,
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

    it("writes an approval over the approved device's root key as the IdP checks it", () => {
        expect(
            text(
                approvalBytes(
                    "https://idp.alice.test/users/alice_xk9mp",
                    DEVICE,
                    new Uint8Array(32).fill(1),
                ),
            ),
        ).toBe(
            "PINAI-DEVICE-APPROVAL-v1\n" +
                "https://idp.alice.test/users/alice_xk9mp\n" +
                "550e8400-e29b-41d4-a716-446655440000\n" +
                "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
        )
    })

    it("writes an archive entry's associated data from its ids, lowercase as the IdP writes UUIDs", () => {
        expect(text(archiveEntryAad("11112222-3333-4444-5555-66667777AAAA", DEVICE))).toBe(
            "PINAI-ARCHIVE-v1\n" + "11112222-3333-4444-5555-66667777aaaa\n" + "550e8400-e29b-41d4-a716-446655440000",
        )
    })
})
