import { forcesRecheck, routeRechecks, withdrawalRechecks, type GateRoute, type KeptWordsReset } from "../../models/admission"
import type { ActorUri } from "../../models/e2ee"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { GateDecision } from "./gate-this-device.usecase"

/** `checked`: the IdP answered; `offline`: decided on what was recorded; `failed`: no decision. */
export type RecheckOutcome = "checked" | "offline" | "failed"

/**
 * What a check says: in (with why, when its kept words let it in over a reset), sent to a page, another
 * account's device wiped (the platform starts afresh), or nothing decided.
 */
export type GateVerdict =
    { kind: "in"; reset: KeptWordsReset | null } | { kind: "go"; route: Exclude<GateRoute, "app"> } | { kind: "wiped" } | { kind: "failed" }

export interface GateSession {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
}

export interface OnboardingGateDeps {
    e2eePort: Pick<IE2eePort, "hasLocalIdentity" | "getBoundActorUri" | "wipeLocalDevice" | "onTrustEvent" | "onTrustWithdrawn" | "pendingHistoryKey">
    /** `gateDecisionUseCase` over the platform's admission ports. */
    decide: (idpUrl: string, accessToken: string, actorUri: ActorUri) => Promise<GateDecision>
    /** The session the gate is for, as it stands now; `null` once signed out. */
    session: () => GateSession | null
    now?: () => number
    warn?: (what: string, error?: unknown) => void
}

function verdictOf({ route, reset }: GateDecision): GateVerdict {
    return route === "app" ? { kind: "in", reset } : { kind: "go", route }
}

/**
 * The onboarding gate, for one signed-in account: only a device that is in reaches the app
 * (`gateDecisionUseCase`). `probe` checks as the app opens; once in, `watch` checks again at once when the
 * device hears its key changed or stops hearing it, and `recheck` when the platform asks — at a route change
 * at most once a spacing, never while a check runs. The newest check decides; one that fails changes nothing.
 * When to call it, and what to show, are the platform's.
 */
export class OnboardingGate {
    private readonly deps: OnboardingGateDeps
    private lastCheckAt: number | null = null
    private running = 0
    private newest = 0
    private watching: { onVerdict: (verdict: GateVerdict) => void; stop: () => void } | null = null

    constructor(deps: OnboardingGateDeps) {
        this.deps = deps
    }

    async probe(): Promise<GateVerdict> {
        const session = this.deps.session()
        if (!session) return { kind: "failed" }
        try {
            const port = this.deps.e2eePort
            if (await port.hasLocalIdentity()) {
                // The account's storage is opened per account: an identity bound to another is that account's.
                const bound = await port.getBoundActorUri()
                if (bound !== null && bound !== session.actorUri) {
                    this.warn(`wiping this device: its identity is bound to ${bound}, ${session.actorUri} is signed in`)
                    await port.wipeLocalDevice()
                    return { kind: "wiped" }
                }
            }
            const decision = await this.deps.decide(session.idpUrl, session.accessToken, session.actorUri)
            this.lastCheckAt = this.now()
            return verdictOf(decision)
        } catch (error) {
            this.warn("the first check failed", error)
            return { kind: "failed" }
        }
    }

    /** Once in: later verdicts go to `onVerdict`. The trust events already standing were weighed by the probe. */
    watch(onVerdict: (verdict: GateVerdict) => void): void {
        this.close()
        const port = this.deps.e2eePort
        let replaying = true
        const stopTold = port.onTrustEvent((event) => {
            if (!replaying && forcesRecheck(event)) void this.recheck(true)
        })
        const stopWithdrawn = port.onTrustWithdrawn((event) => {
            if (!forcesRecheck(event)) return
            port.pendingHistoryKey().then(
                (pending) => {
                    if (withdrawalRechecks(event, pending, this.now())) void this.recheck(true)
                },
                (error: unknown) => this.warn("reading the pending history key failed", error)
            )
        })
        replaying = false
        this.watching = {
            onVerdict,
            stop: () => {
                stopTold()
                stopWithdrawn()
            },
        }
    }

    async recheck(force: boolean): Promise<RecheckOutcome> {
        const watching = this.watching
        const session = this.deps.session()
        if (!watching || !session) return "failed"
        const now = this.now()
        if (!force && !routeRechecks({ running: this.running > 0, lastAt: this.lastCheckAt, now })) return "failed"
        this.lastCheckAt = now
        this.running += 1
        const seq = ++this.newest
        try {
            const decision = await this.deps.decide(session.idpUrl, session.accessToken, session.actorUri)
            if (this.watching === watching && seq === this.newest && this.deps.session() !== null) {
                watching.onVerdict(verdictOf(decision))
            }
            return decision.offline ? "offline" : "checked"
        } catch (error) {
            this.warn("a check failed; the last one stands", error)
            return "failed"
        } finally {
            this.running -= 1
        }
    }

    close(): void {
        this.watching?.stop()
        this.watching = null
    }

    private now(): number {
        return this.deps.now?.() ?? Date.now()
    }

    private warn(what: string, error?: unknown): void {
        this.deps.warn?.(what, error)
    }
}
