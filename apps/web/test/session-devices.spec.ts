/**
 * A session and its device: where each device stands in Settings → Devices, and telling the IdP
 * which device this session signed in.
 */
import { describe, expect, it, vi } from "vitest"

import { type DeviceListEntry, deviceStatus } from "@pinai/domain/models/device"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { ISessionPort } from "@pinai/domain/ports/session.port"
import { linkSessionDeviceUseCase } from "@pinai/domain/usecases/auth/link-session-device.usecase"

function entry(change: Partial<DeviceListEntry>): DeviceListEntry {
    return {
        device_id: "d1",
        display_name: "Firefox on Linux",
        kind: "laptop",
        paired_at: "2026-10-01T09:00:00Z",
        last_seen_at: "2026-10-19T09:00:00Z",
        revoked_at: null,
        signed_in: false,
        last_active_at: null,
        ...change,
    }
}

describe("deviceStatus", () => {
    it("is signed in, active when its session was last used", () => {
        expect(deviceStatus(entry({ signed_in: true, last_active_at: "2026-10-20T08:00:00Z" }))).toEqual({
            kind: "signed-in",
            lastActiveAt: "2026-10-20T08:00:00Z",
        })
    })

    it("is signed out without a live session, and may sign in again", () => {
        expect(deviceStatus(entry({}))).toEqual({ kind: "signed-out" })
    })

    it("is revoked once revoked, whatever its sessions say", () => {
        expect(deviceStatus(entry({ revoked_at: "2026-10-20T10:00:00Z", signed_in: true }))).toEqual({
            kind: "revoked",
            at: "2026-10-20T10:00:00Z",
        })
    })
})

describe("linkSessionDeviceUseCase", () => {
    function ports(hasIdentity: boolean) {
        const linkDevice = vi.fn<ISessionPort["linkDevice"]>(async () => {})
        const sessionPort: ISessionPort = { linkDevice, signOutOtherDevices: vi.fn() }
        const e2eePort = {
            hasLocalIdentity: async () => hasIdentity,
            getDeviceId: async () => "this-device",
        } as unknown as IE2eePort
        return { sessionPort, e2eePort, linkDevice }
    }

    it("names this device to the IdP once it exists", async () => {
        const { linkDevice, ...deps } = ports(true)

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", "access")).toBe(true)
        expect(linkDevice).toHaveBeenCalledWith("https://idp.example", "access", "this-device")
    })

    it("waits for the device a first sign-in's onboarding creates", async () => {
        const { linkDevice, ...deps } = ports(false)

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", "access")).toBe(false)
        expect(linkDevice).not.toHaveBeenCalled()
    })
})
