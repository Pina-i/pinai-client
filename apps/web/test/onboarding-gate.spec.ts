import { describe, expect, it, vi } from "vitest"

import { GATE_RECHECK_SPACING_MS, type KeptWordsReset } from "@pinai/domain/models/admission"
import type { TrustEvent } from "@pinai/domain/models/device-trust"
import type { ActorUri } from "@pinai/domain/models/e2ee"
import { asActorUri } from "@pinai/domain/models/identity"
import type { PendingHistoryKey } from "@pinai/domain/models/history-key"
import { PENDING_KEY_FRESH_MS } from "@pinai/domain/models/history-key"
import type { GateDecision } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { type GateSession, type GateVerdict, OnboardingGate, type OnboardingGateDeps } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"

const ALICE = asActorUri("https://idp.example/users/alice")
const SESSION: GateSession = { idpUrl: "https://idp.example", accessToken: "token", actorUri: ALICE }
const IN: GateDecision = { route: "app", reset: null, offline: false }
const NEW_DEVICE: GateDecision = { route: "new-device", reset: null, offline: false }

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
}

/** A gate over fakes: a clock to move, trust events to tell, the decisions it is given. */
function rig(over: Partial<OnboardingGateDeps> = {}) {
    let now = 1_000_000
    let session: GateSession | null = SESSION
    const told: ((event: TrustEvent) => void)[] = []
    const withdrawn: ((event: TrustEvent) => void)[] = []
    const standing: TrustEvent[] = []
    let pending: PendingHistoryKey | null = null
    const e2eePort = {
        hasLocalIdentity: vi.fn(async () => true),
        getBoundActorUri: vi.fn(async (): Promise<ActorUri | null> => ALICE),
        wipeLocalDevice: vi.fn(async () => undefined),
        onTrustEvent: vi.fn((listener: (event: TrustEvent) => void) => {
            for (const event of standing) listener(event)
            told.push(listener)
            return () => told.splice(told.indexOf(listener), 1)
        }),
        onTrustWithdrawn: vi.fn((listener: (event: TrustEvent) => void) => {
            withdrawn.push(listener)
            return () => withdrawn.splice(withdrawn.indexOf(listener), 1)
        }),
        pendingHistoryKey: vi.fn(async () => pending),
    }
    const decide = vi.fn(async (): Promise<GateDecision> => IN)
    const warn = vi.fn()
    const gate = new OnboardingGate({ e2eePort, decide, session: () => session, now: () => now, warn, ...over })
    const verdicts: GateVerdict[] = []
    return {
        gate,
        e2eePort,
        decide,
        warn,
        verdicts,
        standing,
        watch: () => gate.watch((verdict) => verdicts.push(verdict)),
        tell: (event: TrustEvent) => told.forEach((listener) => listener(event)),
        withdraw: (event: TrustEvent) => withdrawn.forEach((listener) => listener(event)),
        pass: (ms: number) => (now += ms),
        signOut: () => (session = null),
        holdPending: (key: PendingHistoryKey | null) => (pending = key),
        at: () => now,
    }
}

const REPLACED: TrustEvent = { kind: "key-replaced", generation: 3 }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("OnboardingGate", () => {
    it("lets in, with the reason a reset left, or sends the device to its page", async () => {
        const reset: KeptWordsReset = { cause: "reset-by-unapproved", setter: null }
        const { gate, decide } = rig()
        decide.mockResolvedValueOnce({ route: "app", reset, offline: false }).mockResolvedValueOnce(NEW_DEVICE)

        expect(await gate.probe()).toEqual({ kind: "in", reset })
        expect(await gate.probe()).toEqual({ kind: "go", route: "new-device" })
        expect(decide).toHaveBeenCalledWith("https://idp.example", "token", ALICE)
    })

    it("wipes a device bound to another account before deciding anything", async () => {
        const { gate, e2eePort, decide } = rig()
        e2eePort.getBoundActorUri.mockResolvedValue(asActorUri("https://idp.example/users/pierre"))

        expect(await gate.probe()).toEqual({ kind: "wiped" })
        expect(e2eePort.wipeLocalDevice).toHaveBeenCalledOnce()
        expect(decide).not.toHaveBeenCalled()
    })

    it("wipes nothing on a device with no identity yet, or one bound to no account", async () => {
        const fresh = rig()
        fresh.e2eePort.hasLocalIdentity.mockResolvedValue(false)
        const unbound = rig()
        unbound.e2eePort.getBoundActorUri.mockResolvedValue(null)

        expect(await fresh.gate.probe()).toEqual({ kind: "in", reset: null })
        expect(await unbound.gate.probe()).toEqual({ kind: "in", reset: null })
        expect(fresh.e2eePort.wipeLocalDevice).not.toHaveBeenCalled()
        expect(unbound.e2eePort.wipeLocalDevice).not.toHaveBeenCalled()
    })

    it("fails, said, when the decision throws; and decides nothing signed out", async () => {
        const { gate, decide, warn, signOut } = rig()
        decide.mockRejectedValueOnce(new Error("down"))

        expect(await gate.probe()).toEqual({ kind: "failed" })
        expect(warn).toHaveBeenCalled()
        signOut()
        expect(await gate.probe()).toEqual({ kind: "failed" })
    })

    it("checks again only once it watches: at a route change at most once a spacing, at once when forced", async () => {
        const { gate, decide, watch, pass } = rig()
        expect(await gate.recheck(true)).toBe("failed")

        await gate.probe()
        watch()
        expect(await gate.recheck(false)).toBe("failed")
        pass(GATE_RECHECK_SPACING_MS)
        expect(await gate.recheck(false)).toBe("checked")
        expect(await gate.recheck(false)).toBe("failed")
        expect(await gate.recheck(true)).toBe("checked")
        expect(decide).toHaveBeenCalledTimes(3)
    })

    it("never checks at a route change while a check runs", async () => {
        const { gate, decide, watch, pass } = rig()
        await gate.probe()
        watch()
        const held = deferred<GateDecision>()
        decide.mockReturnValueOnce(held.promise)

        const running = gate.recheck(true)
        pass(GATE_RECHECK_SPACING_MS)
        expect(await gate.recheck(false)).toBe("failed")
        held.resolve(IN)
        expect(await running).toBe("checked")
    })

    it("answers `offline` for a decision made on what was recorded, and `failed` for one that throws, the last verdict standing", async () => {
        const { gate, decide, watch, verdicts, warn } = rig()
        await gate.probe()
        watch()
        decide.mockResolvedValueOnce({ ...IN, offline: true }).mockRejectedValueOnce(new Error("down"))

        expect(await gate.recheck(true)).toBe("offline")
        expect(await gate.recheck(true)).toBe("failed")
        expect(verdicts).toEqual([{ kind: "in", reset: null }])
        expect(warn).toHaveBeenCalled()
    })

    it("lets the newest of two overlapping checks decide", async () => {
        const { gate, decide, watch, verdicts } = rig()
        await gate.probe()
        watch()
        const older = deferred<GateDecision>()
        const newer = deferred<GateDecision>()
        decide.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)

        const first = gate.recheck(true)
        const second = gate.recheck(true)
        newer.resolve(NEW_DEVICE)
        older.resolve(IN)
        await Promise.all([first, second])

        expect(verdicts).toEqual([{ kind: "go", route: "new-device" }])
    })

    it("delivers nothing once closed, or once signed out", async () => {
        const closed = rig()
        await closed.gate.probe()
        closed.watch()
        const held = deferred<GateDecision>()
        closed.decide.mockReturnValueOnce(held.promise)
        const check = closed.gate.recheck(true)
        closed.gate.close()
        held.resolve(NEW_DEVICE)
        await check

        const out = rig()
        await out.gate.probe()
        out.watch()
        const later = deferred<GateDecision>()
        out.decide.mockReturnValueOnce(later.promise)
        const outCheck = out.gate.recheck(true)
        out.signOut()
        later.resolve(NEW_DEVICE)
        await outCheck

        expect(closed.verdicts).toEqual([])
        expect(out.verdicts).toEqual([])
    })

    it("checks at once on a trust event that forces one, never for those replayed as it starts watching", async () => {
        const { gate, decide, watch, tell, standing } = rig()
        await gate.probe()
        standing.push(REPLACED)
        watch()
        await flush()
        expect(decide).toHaveBeenCalledTimes(1)

        tell({ kind: "unapproved-device", deviceId: "d", displayName: "x", rootKey: new Uint8Array(), arrived: true } as TrustEvent)
        await flush()
        expect(decide).toHaveBeenCalledTimes(1)
        tell(REPLACED)
        await flush()
        expect(decide).toHaveBeenCalledTimes(2)
    })

    it("checks at once when such an event is withdrawn, unless a pending key written just now waits", async () => {
        const { gate, decide, watch, withdraw, holdPending, at } = rig()
        await gate.probe()
        watch()

        holdPending({ mintedAt: at() - 1_000 } as PendingHistoryKey)
        withdraw(REPLACED)
        await flush()
        expect(decide).toHaveBeenCalledTimes(1)

        holdPending({ mintedAt: at() - PENDING_KEY_FRESH_MS } as PendingHistoryKey)
        withdraw(REPLACED)
        await flush()
        expect(decide).toHaveBeenCalledTimes(2)
    })

    it("stops listening once closed", async () => {
        const { gate, decide, watch, tell } = rig()
        await gate.probe()
        watch()
        gate.close()
        tell(REPLACED)
        await flush()
        expect(decide).toHaveBeenCalledTimes(1)
    })
})
