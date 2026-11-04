/**
 * The onboarding gate's decision table. An account with no history key goes to setup — a local
 * identity or not, so a first device cut short before its key was set resumes there — unless the
 * device saw a key before; otherwise a local identity is admitted, and a new device restores.
 */
import { describe, expect, it } from "vitest"

import { decideGateRoute } from "@/presentation/hooks/useIdentityOnboardingGate"

describe("decideGateRoute", () => {
    it("admits a device with a local identity on an account with a key, or when the probe failed", () => {
        expect(decideGateRoute({ hasLocal: true, hasHistoryKey: true, sawHistoryKey: true })).toBe("app")
        expect(decideGateRoute({ hasLocal: true, hasHistoryKey: null, sawHistoryKey: false })).toBe("app")
    })

    it("sends an account without a key to setup, a first device cut short included", () => {
        expect(decideGateRoute({ hasLocal: false, hasHistoryKey: false, sawHistoryKey: false })).toBe("setup")
        expect(decideGateRoute({ hasLocal: true, hasHistoryKey: false, sawHistoryKey: false })).toBe("setup")
        expect(decideGateRoute({ hasLocal: false, hasHistoryKey: null, sawHistoryKey: false })).toBe("setup")
    })

    it("never founds again on a device that saw a key: its key gone is a rollback", () => {
        expect(decideGateRoute({ hasLocal: true, hasHistoryKey: false, sawHistoryKey: true })).toBe("app")
    })

    it("sends a new device on an account with a key to restore", () => {
        expect(decideGateRoute({ hasLocal: false, hasHistoryKey: true, sawHistoryKey: false })).toBe("restore")
    })
})
