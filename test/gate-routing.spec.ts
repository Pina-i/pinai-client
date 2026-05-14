/**
 * Pure-function test for the Phase 7 identity onboarding gate's decision
 * table. The hook itself wires this into React Router + an async probe,
 * but the branching logic is the pure `decideGateRoute` function — tested
 * here without React Router plumbing.
 *
 * Phase 7 simplified the table to two branches: local identity present
 * → app; absent → setup. The previous "restore" branch (recover MSK from
 * server-stored passphrase blob) is gone — per-device identity is the
 * model now.
 */
import { describe, expect, it } from "vitest"

import { decideGateRoute } from "@/presentation/hooks/useIdentityOnboardingGate"

describe("decideGateRoute", () => {
    it("admits to the app when a local identity exists", () => {
        expect(decideGateRoute({ hasLocal: true })).toBe("app")
    })

    it("routes to setup when no local identity is present", () => {
        expect(decideGateRoute({ hasLocal: false })).toBe("setup")
    })
})
