import { describe, expect, it, vi } from "vitest"

import type { IE2eePort } from "@/domain/ports/e2ee.port"
import { registerDeviceUseCase } from "@/domain/usecases/e2ee/register-device.usecase"

describe("registerDeviceUseCase", () => {
    it("delegates to e2eePort.registerDevice with the right args", async () => {
        const port = {
            registerDevice: vi.fn().mockResolvedValue(undefined),
        } as unknown as IE2eePort
        await registerDeviceUseCase({ e2eePort: port })({
            idpUrl: "https://idp.alice.com",
            accessToken: "tok",
            actorUri: "https://idp.alice.com/users/alice",
        })
        expect(port.registerDevice).toHaveBeenCalledWith(
            "https://idp.alice.com",
            "tok",
            "https://idp.alice.com/users/alice",
        )
    })

    it("propagates port errors", async () => {
        const port = {
            registerDevice: vi.fn().mockRejectedValue(new Error("attestation failed")),
        } as unknown as IE2eePort
        await expect(
            registerDeviceUseCase({ e2eePort: port })({
                idpUrl: "https://idp.alice.com",
                accessToken: "tok",
                actorUri: "https://idp.alice.com/users/alice",
            }),
        ).rejects.toThrow("attestation failed")
    })
})
