/**
 * Pure-function test for the identity onboarding gate's decision table.
 *
 * The hook itself wires this into React Router + an async probe, but
 * the actual branching logic is the pure `decideGateRoute` function
 * — testing it here avoids needing React Router test plumbing.
 */
import { describe, expect, it } from "vitest"

import { decideGateRoute } from "@/presentation/hooks/useIdentityOnboardingGate"

describe("decideGateRoute", () => {
    it("admits to the app when a local identity exists, regardless of server state", () => {
        expect(
            decideGateRoute({ hasLocal: true, hasServerIdentity: true, hasServerBlob: true }),
        ).toBe("app")
        expect(
            decideGateRoute({ hasLocal: true, hasServerIdentity: true, hasServerBlob: false }),
        ).toBe("app")
        expect(
            decideGateRoute({ hasLocal: true, hasServerIdentity: false, hasServerBlob: false }),
        ).toBe("app")
    })

    it("routes to setup when neither local nor server identity is present", () => {
        expect(
            decideGateRoute({ hasLocal: false, hasServerIdentity: false, hasServerBlob: false }),
        ).toBe("setup")
    })

    it("routes to restore when server identity exists with a recovery blob", () => {
        expect(
            decideGateRoute({ hasLocal: false, hasServerIdentity: true, hasServerBlob: true }),
        ).toBe("restore")
    })

    it("routes to restore (degraded) when server identity exists but no recovery blob", () => {
        // The Restore page handles both variants — the table just
        // decides where to send the user, not what UI to render.
        expect(
            decideGateRoute({ hasLocal: false, hasServerIdentity: true, hasServerBlob: false }),
        ).toBe("restore")
    })
})
