/**
 * Pure-function test for the onboarding gate's decision table. The hook
 * wires this into React Router + an async probe; the branching itself
 * is the pure `decideGateRoute` function tested here.
 *
 *  - `hasLocal: true`                       → app
 *  - `hasLocal: false`, `hasArchive: false` → setup    (first device)
 *  - `hasLocal: false`, `hasArchive: true`  → restore  (returning user on a fresh device)
 */
import { describe, expect, it } from "vitest"

import { decideGateRoute } from "@/presentation/hooks/useIdentityOnboardingGate"

describe("decideGateRoute", () => {
    it("admits to the app when a local identity exists", () => {
        expect(decideGateRoute({ hasLocal: true, hasArchive: false })).toBe("app")
        expect(decideGateRoute({ hasLocal: true, hasArchive: true })).toBe("app")
    })

    it("routes to setup on a first-device sign-in", () => {
        expect(decideGateRoute({ hasLocal: false, hasArchive: false })).toBe("setup")
    })

    it("routes to restore on a new device when the account has a history archive", () => {
        expect(decideGateRoute({ hasLocal: false, hasArchive: true })).toBe("restore")
    })
})
