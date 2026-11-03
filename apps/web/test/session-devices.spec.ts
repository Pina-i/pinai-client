/**
 * A session and its device: where each device stands in Settings → Devices, and telling the IdP
 * which device this session signed in.
 */
import { describe, expect, it, vi } from "vitest"

import { type DeviceListEntry, deviceStatus } from "@pinai/domain/models/device"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { ISessionPort } from "@pinai/domain/ports/session.port"
import { linkSessionDeviceUseCase } from "@pinai/domain/usecases/auth/link-session-device.usecase"
import { asActorUri } from "@pinai/domain/models/identity"
import { IdpError } from "@pinai/domain/models/idp-error"

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
        drk_public_key: null,
        attestation_signature: null,
        attestation_kid: null,
        attestation_expires_at: null,
        hpke_public_key: null,
        hpke_key_signature: null,
        history_generation: null,
        approvals: [],
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
    const ME = asActorUri("https://idp.example/users/alice")

    function ports(hasIdentity: boolean, registerDevice = vi.fn<IE2eePort["registerDevice"]>(async () => {})) {
        const order: string[] = []
        const linkDevice = vi.fn<ISessionPort["linkDevice"]>(async () => void order.push("link"))
        const sessionPort: ISessionPort = { linkDevice, signOutOtherDevices: vi.fn() }
        const e2eePort = {
            hasLocalIdentity: async () => hasIdentity,
            getDeviceId: async () => "this-device",
            registerDevice: vi.fn<IE2eePort["registerDevice"]>(async (...args) => {
                order.push("register")
                return registerDevice(...args)
            }),
        } as unknown as IE2eePort
        return { sessionPort, e2eePort, linkDevice, order }
    }

    it("registers the device again when it has to, then names it to the IdP", async () => {
        const { linkDevice, order, ...deps } = ports(true)

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", "access", ME)).toEqual({ linked: true })
        expect(deps.e2eePort.registerDevice).toHaveBeenCalledWith("https://idp.example", "access", ME)
        expect(linkDevice).toHaveBeenCalledWith("https://idp.example", "access", "this-device")
        expect(order).toEqual(["register", "link"])
    })

    it("names the device all the same when the registration fails another way, and says why", async () => {
        const unavailable = new IdpError(503, "", "Service unavailable")
        const { linkDevice, order: _order, ...deps } = ports(true, vi.fn(async () => Promise.reject(unavailable)))

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", "access", ME)).toEqual({
            linked: true,
            registrationFailure: unavailable,
        })
        expect(linkDevice).toHaveBeenCalledWith("https://idp.example", "access", "this-device")
    })

    it("names nothing when the session names another device", async () => {
        const mismatch = new IdpError(403, "device_mismatch", "This session signed in another device")
        const { linkDevice, order: _order, ...deps } = ports(true, vi.fn(async () => Promise.reject(mismatch)))

        await expect(linkSessionDeviceUseCase(deps)("https://idp.example", "access", ME)).rejects.toBe(mismatch)
        expect(linkDevice).not.toHaveBeenCalled()
    })

    it("waits for the device a first sign-in's onboarding creates", async () => {
        const { linkDevice, order: _order, ...deps } = ports(false)

        expect(await linkSessionDeviceUseCase(deps)("https://idp.example", "access", ME)).toEqual({ linked: false })
        expect(deps.e2eePort.registerDevice).not.toHaveBeenCalled()
        expect(linkDevice).not.toHaveBeenCalled()
    })
})
