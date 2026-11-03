/**
 * `GET /api/keys/devices` as the client reads it: what another device needs to check a device's
 * chain itself, base64 decoded, and its approvals as the IdP lists them.
 */
import { describe, expect, it } from "vitest"

import { parseDeviceList } from "@pinai/api/device-directory/device-directory-api.adapter"

const ROW = {
    device_id: "550e8400-e29b-41d4-a716-446655440000",
    display_name: "Firefox on Linux",
    kind: "laptop",
    paired_at: "2026-11-01T09:00:00Z",
    last_seen_at: "2026-11-02T09:00:00Z",
    revoked_at: null,
    signed_in: true,
    last_active_at: "2026-11-02T09:00:00Z",
    attestation_expires_at: "2027-11-01T09:00:00Z",
    drk_public_key: "AQID",
    attestation_signature: "BAUG",
    attestation_kid: "key-2026-01",
    hpke_public_key: "BwgJ",
    hpke_key_signature: "CgsM",
    history_generation: 2,
    approvals: [
        { by: "passphrase", generation: 2, signature: "DQ4P", created_at: "2026-11-01T09:01:00Z" },
        { by: "device", device_id: "11112222-3333-4444-5555-666677778888", signature: "EBES", created_at: "2026-11-01T09:02:00Z" },
    ],
}

describe("parseDeviceList", () => {
    it("decodes each device's keys and signatures, and its approvals", () => {
        const [device] = parseDeviceList({ devices: [ROW] }).devices

        expect(device).toMatchObject({
            device_id: ROW.device_id,
            revoked_at: null,
            signed_in: true,
            drk_public_key: new Uint8Array([1, 2, 3]),
            attestation_signature: new Uint8Array([4, 5, 6]),
            attestation_kid: "key-2026-01",
            attestation_expires_at: "2027-11-01T09:00:00Z",
            hpke_public_key: new Uint8Array([7, 8, 9]),
            hpke_key_signature: new Uint8Array([10, 11, 12]),
            history_generation: 2,
        })
        expect(device.approvals).toEqual([
            { by: "passphrase", generation: 2, signature: new Uint8Array([13, 14, 15]), created_at: "2026-11-01T09:01:00Z" },
            {
                by: "device",
                device_id: "11112222-3333-4444-5555-666677778888",
                signature: new Uint8Array([16, 17, 18]),
                created_at: "2026-11-01T09:02:00Z",
            },
        ])
    })

    it("reads a device with no root key yet as holding none", () => {
        const [device] = parseDeviceList({
            devices: [
                {
                    ...ROW,
                    attestation_expires_at: null,
                    drk_public_key: null,
                    attestation_signature: null,
                    attestation_kid: null,
                    hpke_public_key: null,
                    hpke_key_signature: null,
                    history_generation: null,
                    approvals: [],
                },
            ],
        }).devices

        expect(device).toMatchObject({
            drk_public_key: null,
            attestation_signature: null,
            hpke_public_key: null,
            history_generation: null,
            approvals: [],
        })
    })

    it("reads a key that isn't base64 as none, and leaves an approval that isn't one out", () => {
        const [device] = parseDeviceList({
            devices: [
                {
                    ...ROW,
                    hpke_public_key: "not base64!",
                    approvals: [{ by: "someone", signature: "DQ4P", created_at: "2026-11-01T09:01:00Z" }, ...ROW.approvals],
                },
            ],
        }).devices

        expect(device.hpke_public_key).toBeNull()
        expect(device.approvals.map((a) => a.by)).toEqual(["passphrase", "device"])
    })
})
