import { describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import { asActorUri } from "@pinai/domain/models/identity"
import type { GateSession } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"
import { ThisDeviceStart, type ThisDeviceStartDeps } from "@pinai/domain/usecases/e2ee/this-device-start.usecase"

const SESSION: GateSession = { idpUrl: "https://idp.example", accessToken: "token", actorUri: asActorUri("https://idp.example/users/alice") }

function rig(over: Partial<ThisDeviceStartDeps> = {}) {
    let session: GateSession | null = SESSION
    const start = vi.fn(async () => ({ linked: true }) as Awaited<ReturnType<ThisDeviceStartDeps["start"]>>)
    const signInAgainOnDeviceMismatch = vi.fn(async () => false)
    const warn = vi.fn()
    const device = new ThisDeviceStart({ start, session: () => session, signInAgainOnDeviceMismatch, warn, ...over })
    return { device, start, signInAgainOnDeviceMismatch, warn, signOut: () => (session = null) }
}

describe("ThisDeviceStart", () => {
    it("starts the device once it's linked with its words checked, never again", async () => {
        const { device, start } = rig()
        await device.run()
        await device.run()
        expect(start).toHaveBeenCalledOnce()
        expect(start).toHaveBeenCalledWith("https://idp.example", "token", SESSION.actorUri)
    })

    it("runs once at a time", async () => {
        const { device, start } = rig()
        await Promise.all([device.run(), device.run()])
        expect(start).toHaveBeenCalledOnce()
    })

    it("tries again at the next call when not yet linked, or when the history key's check failed — said", async () => {
        const { device, start, warn } = rig()
        start.mockResolvedValueOnce({ linked: false }).mockResolvedValueOnce({ linked: true, historyKeyFailure: new Error("x") })
        await device.run()
        await device.run()
        await device.run()
        await device.run()
        expect(start).toHaveBeenCalledTimes(3)
        expect(warn).toHaveBeenCalledWith("checking the history key failed", expect.any(Error))
    })

    it("says a registration that failed, and settles all the same once linked", async () => {
        const { device, start, warn } = rig()
        start.mockResolvedValueOnce({ linked: true, registrationFailure: new Error("y") })
        await device.run()
        await device.run()
        expect(start).toHaveBeenCalledOnce()
        expect(warn).toHaveBeenCalledWith("registering this device failed", expect.any(Error))
    })

    it("settles on the IdP's refusal, tries again after anything else", async () => {
        const refused = rig()
        refused.start.mockRejectedValueOnce(new IdpError(403, "device_revoked", "Revoked"))
        await refused.device.run()
        await refused.device.run()
        expect(refused.start).toHaveBeenCalledOnce()

        const unreachable = rig()
        unreachable.start.mockRejectedValueOnce(new TypeError("Failed to fetch"))
        await unreachable.device.run()
        await unreachable.device.run()
        expect(unreachable.start).toHaveBeenCalledTimes(2)
    })

    it("leaves a session naming another device to signing in again", async () => {
        const { device, start, signInAgainOnDeviceMismatch } = rig()
        const mismatch = new IdpError(403, "device_mismatch", "Another device")
        start.mockRejectedValueOnce(mismatch)
        signInAgainOnDeviceMismatch.mockResolvedValueOnce(true)
        await device.run()
        expect(signInAgainOnDeviceMismatch).toHaveBeenCalledWith(mismatch)
    })

    it("does nothing signed out", async () => {
        const { device, start, signOut } = rig()
        signOut()
        await device.run()
        expect(start).not.toHaveBeenCalled()
    })
})
