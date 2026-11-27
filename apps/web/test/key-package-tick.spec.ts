/**
 * When the KeyPackage tick runs, for every client: at start, every 6 h and on `key_packages_low`, until stopped; a
 * renewal failure handed to the platform, which signs in again on `device_mismatch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActorUri } from "@pinai/domain/models/e2ee"
import {
    KEY_PACKAGE_REFILL_INTERVAL_MS,
    KeyPackageTick,
    type Replenished,
} from "@pinai/domain/usecases/e2ee/replenish-keypackages.usecase"

const IDP = "https://idp.test"
const ACTOR = "https://idp.test/users/alice" as ActorUri
const done: Replenished = { admission: { kind: "in" } as Replenished["admission"], status: null }

function tick(options: { token?: string | null } = {}) {
    const token = options.token === undefined ? "tok" : options.token
    const replenish = vi.fn(async (_input: unknown): Promise<Replenished> => done)
    const renewalFailed = vi.fn()
    const report = vi.fn()
    const made = new KeyPackageTick({ session: { idpUrl: IDP, actorUri: ACTOR, accessToken: () => token }, replenish, renewalFailed, report })
    return { made, replenish, renewalFailed, report }
}

const settle = () => vi.advanceTimersByTimeAsync(0)

describe("KeyPackageTick", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("runs as it starts, then every 6 h", async () => {
        const { made, replenish } = tick()
        made.start()
        await settle()
        expect(replenish).toHaveBeenCalledExactlyOnceWith({ idpUrl: IDP, accessToken: "tok", actorUri: ACTOR })

        await vi.advanceTimersByTimeAsync(KEY_PACKAGE_REFILL_INTERVAL_MS - 1)
        expect(replenish).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(replenish).toHaveBeenCalledTimes(2)
    })

    it("runs on key_packages_low, only once started", async () => {
        const { made, replenish } = tick()
        made.low()
        await settle()
        expect(replenish).not.toHaveBeenCalled()

        made.start()
        made.low()
        await settle()
        expect(replenish).toHaveBeenCalledTimes(2)
    })

    it("hands a renewal failure to the platform", async () => {
        const { made, replenish, renewalFailed } = tick()
        const failure = new Error("device_mismatch")
        replenish.mockResolvedValueOnce({ ...done, renewalFailure: failure })
        made.start()
        await settle()
        expect(renewalFailed).toHaveBeenCalledExactlyOnceWith(failure)

        made.low()
        await settle()
        expect(renewalFailed).toHaveBeenCalledTimes(1)
    })

    it("reports a failed top-up, or a failure handling the renewal's, and goes on ticking", async () => {
        const { made, replenish, renewalFailed, report } = tick()
        replenish.mockRejectedValueOnce(new Error("down"))
        made.start()
        await settle()
        expect(report).toHaveBeenCalledWith("topping up the KeyPackages", expect.any(Error))

        replenish.mockResolvedValueOnce({ ...done, renewalFailure: "expired" })
        renewalFailed.mockRejectedValueOnce(new Error("sign-in"))
        made.low()
        await settle()
        expect(report).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(KEY_PACKAGE_REFILL_INTERVAL_MS)
        expect(replenish).toHaveBeenCalledTimes(3)
    })

    it("runs nothing without a token", async () => {
        const { made, replenish } = tick({ token: null })
        made.start()
        made.low()
        await vi.advanceTimersByTimeAsync(KEY_PACKAGE_REFILL_INTERVAL_MS)

        expect(replenish).not.toHaveBeenCalled()
    })

    it("runs nothing more once stopped", async () => {
        const { made, replenish } = tick()
        made.start()
        await settle()
        made.stop()
        made.low()
        await vi.advanceTimersByTimeAsync(7 * 60 * 60_000)

        expect(replenish).toHaveBeenCalledTimes(1)
    })
})
