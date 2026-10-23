/**
 * Revoking a device: the IdP first — it signs the device out, or refuses before anything was
 * done, asking for the password again — then the MLS Remove commits.
 */
import { describe, expect, it, vi } from "vitest"

import type { ActorUri } from "@pinai/domain/models/e2ee"
import { IdpError, needsRecentSignIn } from "@pinai/domain/models/idp-error"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { revokeDeviceUseCase } from "@pinai/domain/usecases/e2ee/revoke-device.usecase"

const INPUT = {
    idpUrl: "http://idp.test",
    accessToken: "access",
    actorUri: "http://idp.test/users/alice_xk9mp" as ActorUri,
    deviceId: "device-2",
    conversationIds: ["c1"],
}

function ports(markRevoked: IDeviceDirectoryPort["markRevoked"]) {
    const done: string[] = []
    const deviceDirectoryPort: IDeviceDirectoryPort = {
        listDevices: vi.fn(),
        markRevoked: vi.fn(async (idpUrl: string, accessToken: string, deviceId: string) => {
            await markRevoked(idpUrl, accessToken, deviceId)
            done.push("revoked at the IdP")
        }),
    }
    const e2eePort = {
        revokeDevice: vi.fn(async () => {
            done.push("removed from the groups")
            return { removed_from: ["c1"] }
        }),
    } as unknown as IE2eePort
    return { e2eePort, deviceDirectoryPort, done }
}

describe("revokeDeviceUseCase", () => {
    it("has the IdP sign the device out, then removes it from the groups", async () => {
        const { done, ...deps } = ports(async () => {})

        expect(await revokeDeviceUseCase(deps)(INPUT)).toEqual({ removed_from: ["c1"] })
        expect(done).toEqual(["revoked at the IdP", "removed from the groups"])
    })

    it("does nothing more when the IdP asks for the password again", async () => {
        const refusal = new IdpError(401, "insufficient_user_authentication", "Type your password again to do this")
        const { done, ...deps } = ports(async () => {
            throw refusal
        })

        const failed = await revokeDeviceUseCase(deps)(INPUT).catch((e: unknown) => e)

        expect(needsRecentSignIn(failed)).toBe(true)
        expect(done).toEqual([])
        expect(deps.e2eePort.revokeDevice).not.toHaveBeenCalled()
    })
})
