import { describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import { asActorUri } from "@pinai/domain/models/identity"
import type { StartOverRequest } from "@pinai/domain/models/start-over"
import type { GateSession } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"
import { StartOverFlow, type StartOverFlowDeps, type StartOverFlowHooks } from "@pinai/domain/usecases/e2ee/start-over-flow.usecase"

const SESSION: GateSession = { idpUrl: "https://idp.example", accessToken: "token", actorUri: asActorUri("https://idp.example/users/alice") }
const NOW = 100_000
const request = (over: Partial<StartOverRequest> = {}): StartOverRequest =>
    ({ id: "r1", deviceId: "phone", displayName: "", createdAt: NOW - 10, readyAt: NOW + 60_000, ended: null, ...over }) as StartOverRequest

function rig(over: Partial<StartOverFlowDeps> = {}) {
    let session: GateSession | null = SESSION
    const steps: (string | null)[] = []
    const hooks: StartOverFlowHooks = {
        known: vi.fn(),
        held: vi.fn(),
        reread: vi.fn(async () => undefined),
        step: (step) => steps.push(step),
    }
    const deps: StartOverFlowDeps = {
        session: () => session,
        ask: vi.fn(async () => ({ kind: "asked" as const, request: request() })),
        startOver: vi.fn(async () => ({ kind: "started-over" as const, generation: 3, words: ["new"] })),
        end: vi.fn(async () => undefined),
        newWordsToShow: vi.fn(async () => null),
        clockLead: () => 0,
        signInAgainOnDeviceMismatch: vi.fn(async () => false),
        warn: vi.fn(),
        now: () => NOW,
        ...over,
    }
    return { flow: new StartOverFlow(deps, hooks), deps, hooks, steps, signOut: () => (session = null) }
}

describe("StartOverFlow", () => {
    it("asks first; a request not matured is kept and read again, nothing minted", async () => {
        const { flow, deps, hooks, steps } = rig()
        expect(await flow.startOver(null)).toEqual({ kind: "quiet" })
        expect(hooks.known).toHaveBeenCalledWith({ kind: "request", request: request() })
        expect(hooks.reread).toHaveBeenCalled()
        expect(deps.startOver).not.toHaveBeenCalled()
        expect(steps).toEqual(["asking", null, null])
    })

    it("finishes at once a request matured as it opened, or when no request is needed", async () => {
        const matured = rig({ ask: vi.fn(async () => ({ kind: "asked" as const, request: request({ readyAt: NOW - 10 }) })) })
        expect(await matured.flow.startOver("watch")).toEqual({ kind: "started-over", words: ["new"] })
        expect(matured.deps.startOver).toHaveBeenCalledWith(SESSION, "watch")
        expect(matured.steps).toEqual(["asking", null, "starting", null, null])

        const needless = rig({ ask: vi.fn(async () => ({ kind: "not-needed" as const })) })
        expect(await needless.flow.startOver(null)).toEqual({ kind: "started-over", words: ["new"] })
    })

    it("keeps another device's request as read, and says three a day are used up", async () => {
        const elsewhere = rig({ ask: vi.fn(async () => ({ kind: "elsewhere" as const })) })
        expect(await elsewhere.flow.startOver(null)).toEqual({ kind: "quiet" })
        expect(elsewhere.hooks.known).toHaveBeenCalledWith({ kind: "elsewhere" })

        const tooMany = rig({ ask: vi.fn(async () => ({ kind: "too-many" as const })) })
        expect(await tooMany.flow.startOver(null)).toEqual({ kind: "too-many" })
    })

    it("answers what a finish came to", async () => {
        const cases = [
            [{ kind: "recent-sign-in" }, { kind: "needs-recent-sign-in" }],
            [{ kind: "conflict" }, { kind: "went-otherwise", how: "conflict" }],
            [{ kind: "key-changed" }, { kind: "went-otherwise", how: "key-changed" }],
            [{ kind: "rolled-back" }, { kind: "rolled-back" }],
        ] as const
        for (const [outcome, end] of cases) {
            const { flow } = rig({ startOver: vi.fn(async () => outcome) } as Partial<StartOverFlowDeps>)
            expect(await flow.finish("r1", null)).toEqual(end)
        }
    })

    it("holds a finish the IdP found too early until its date, by this device's clock's lead, and reads the request again", async () => {
        const { flow, hooks } = rig({ startOver: vi.fn(async () => ({ kind: "not-ready" as const, readyAt: NOW + 5_000 })), clockLead: () => 2_000 })
        expect(await flow.finish("r1", null)).toEqual({ kind: "quiet" })
        expect(hooks.held).toHaveBeenCalledWith({ requestId: "r1", readyAt: NOW + 5_000, until: NOW + 7_000 })
        expect(hooks.reread).toHaveBeenCalled()

        const unknown = rig({ startOver: vi.fn(async () => ({ kind: "request-required" as const })) })
        expect(await unknown.flow.finish("r1", null)).toEqual({ kind: "quiet" })
        expect(unknown.hooks.held).not.toHaveBeenCalled()
        expect(unknown.hooks.reread).toHaveBeenCalled()
    })

    it("a finish failing: signs in again on a session naming another device; shows new words it may have set; else fails, said", async () => {
        const mismatch = rig({ startOver: vi.fn(async () => Promise.reject(new IdpError(403, "device_mismatch", "x"))) })
        vi.mocked(mismatch.deps.signInAgainOnDeviceMismatch).mockResolvedValue(true)
        expect(await mismatch.flow.finish("r1", null)).toEqual({ kind: "quiet" })

        const words = rig({
            startOver: vi.fn(async () => Promise.reject(new Error("down"))),
            newWordsToShow: vi.fn(async () => ({ words: ["set"] })),
        })
        expect(await words.flow.finish("r1", null)).toEqual({ kind: "started-over", words: ["set"] })

        const down = new Error("down")
        const failing = rig({ startOver: vi.fn(async () => Promise.reject(down)) })
        expect(await failing.flow.finish("r1", null)).toEqual({ kind: "failed", during: "finish", error: down })
        expect(failing.deps.warn).toHaveBeenCalledWith("starting over", down)
    })

    it("an ask failing is said; withdrawing ends the request and reads it again, a failure said", async () => {
        const down = new Error("down")
        const asking = rig({ ask: vi.fn(async () => Promise.reject(down)) })
        expect(await asking.flow.startOver(null)).toEqual({ kind: "failed", during: "ask", error: down })

        const { flow, deps, hooks, steps } = rig()
        expect(await flow.withdraw("r1")).toEqual({ kind: "quiet" })
        expect(deps.end).toHaveBeenCalledWith(SESSION, "r1")
        expect(hooks.reread).toHaveBeenCalled()
        expect(steps).toEqual(["withdrawing", null])

        const refusing = rig({ end: vi.fn(async () => Promise.reject(down)) })
        expect(await refusing.flow.withdraw("r1")).toEqual({ kind: "failed", during: "withdraw", error: down })
    })

    it("runs one step at a time, and none signed out", async () => {
        const { flow, deps } = rig()
        const first = flow.startOver(null)
        expect(flow.busy).toBe(true)
        expect(await flow.finish("r1", null)).toEqual({ kind: "quiet" })
        await first
        expect(flow.busy).toBe(false)
        expect(deps.startOver).not.toHaveBeenCalled()

        const out = rig()
        out.signOut()
        expect(await out.flow.startOver(null)).toEqual({ kind: "quiet" })
        expect(out.deps.ask).not.toHaveBeenCalled()
    })
})
