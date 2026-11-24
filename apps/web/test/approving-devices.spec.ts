import { describe, expect, it } from "vitest"

import { approvingDevices } from "@pinai/domain/models/approval-handshake"
import type { DeviceListEntry } from "@pinai/domain/models/device"

function device(id: string, change: Partial<DeviceListEntry> = {}): DeviceListEntry {
    return {
        device_id: id,
        display_name: "Firefox on Windows",
        automatic_name: "Firefox on Windows",
        chosen_name: null,
        kind: "laptop",
        client: "browser",
        paired_at: "2026-11-01T00:00:00Z",
        last_seen_at: "2026-11-04T00:00:00Z",
        revoked_at: null,
        signed_in: true,
        last_active_at: null,
        drk_public_key: null,
        attestation_signature: null,
        ...change,
    } as DeviceListEntry
}

describe("approvingDevices", () => {
    it("lists the account's other devices, not this one nor a revoked one", () => {
        const devices = [
            device("here", { display_name: "Pixel 9 Pro", kind: "phone" }),
            device("laptop"),
            device("gone", { revoked_at: "2026-11-03T00:00:00Z" }),
        ]
        expect(approvingDevices(devices, "here")).toEqual([{ deviceId: "laptop", label: "Firefox on Windows", kind: "laptop" }])
    })

    it("names a device without a shown name, and lists them all while this one isn't known", () => {
        const devices = [device("a", { display_name: "  " }), device("b")]
        expect(approvingDevices(devices, null).map((d) => d.label)).toEqual(["A device", "Firefox on Windows"])
    })
})
