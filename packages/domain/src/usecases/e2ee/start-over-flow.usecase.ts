import type { DeviceId } from "../../models/e2ee"
import { holdAfterRefusal, startOverReady, type FinishHold, type StartOverRead } from "../../models/start-over"
import type { GateSession } from "./onboarding-gate.usecase"
import type { StartOverAsk } from "./start-over-request.usecase"
import type { StartOver } from "./start-over.usecase"

export type StartOverStep = "asking" | "starting" | "withdrawing"

/** What a step came to, for the panel to say; `quiet` when there is nothing to say. */
export type StartOverFlowResult =
    | { kind: "started-over"; words: string[] }
    | { kind: "needs-recent-sign-in" }
    | { kind: "went-otherwise"; how: "conflict" | "key-changed" }
    | { kind: "rolled-back" }
    | { kind: "too-many" }
    | { kind: "failed"; during: "ask" | "finish" | "withdraw"; error: unknown }
    | { kind: "quiet" }

export interface StartOverFlowDeps {
    /** The session as it stands at each step; `null` signed out. */
    session: () => GateSession | null
    /** `askToStartOverUseCase`. */
    ask: (session: GateSession) => Promise<StartOverAsk>
    /** `startOverUseCase`, with the token's arrival and the platform's lock. */
    startOver: (session: GateSession, refused: DeviceId | null) => Promise<StartOver>
    /** `endStartOverUseCase`. */
    end: (session: GateSession, requestId: string) => Promise<unknown>
    newWordsToShow: () => Promise<{ words: string[] } | null>
    /** How far this device's clock runs ahead of the IdP's (`clockLeadOf`); `null` unknown. */
    clockLead: (session: GateSession) => number | null
    signInAgainOnDeviceMismatch: (error: unknown) => Promise<boolean>
    warn?: (what: string, error: unknown) => void
    now?: () => number
}

export interface StartOverFlowHooks {
    /** What the flow learnt of this device's request: the platform's copy changes. */
    known: (read: StartOverRead) => void
    /** A finish refused as too early: held until its date, the request's date the IdP's. */
    held: (hold: FinishHold) => void
    reread: () => Promise<unknown>
    /** The step running; `null` once none. */
    step: (step: StartOverStep | null) => void
}

const QUIET: StartOverFlowResult = { kind: "quiet" }

/**
 * A device not approved starting over (`identity-provider/specs/e2ee.md § 3.12`): it asks first and finishes
 * once its request matured — at once when nothing is to wait for. One step at a time. The password's age is the
 * start over's own check (`needs-recent-sign-in`: nothing minted); a finish the IdP finds too early is held
 * until its date, so no press mints anything the refusal already answered.
 */
export class StartOverFlow {
    private readonly deps: StartOverFlowDeps
    private readonly hooks: StartOverFlowHooks
    private running = false

    constructor(deps: StartOverFlowDeps, hooks: StartOverFlowHooks) {
        this.deps = deps
        this.hooks = hooks
    }

    get busy(): boolean {
        return this.running
    }

    /** "Erase and start over". */
    async startOver(refused: DeviceId | null): Promise<StartOverFlowResult> {
        const session = this.deps.session()
        if (this.running || !session) return QUIET
        this.running = true
        this.hooks.step("asking")
        try {
            const asked = await this.deps.ask(session)
            switch (asked.kind) {
                case "asked":
                    this.hooks.known({ kind: "request", request: asked.request })
                    this.hooks.step(null)
                    if (startOverReady(asked.request, this.now())) return await this.finishing(asked.request.id, refused)
                    void this.hooks.reread()
                    return QUIET
                case "not-needed":
                    this.hooks.step(null)
                    return await this.finishing(null, refused)
                case "elsewhere":
                    this.hooks.known({ kind: "elsewhere" })
                    return QUIET
                case "too-many":
                    return { kind: "too-many" }
            }
        } catch (error) {
            if (await this.deps.signInAgainOnDeviceMismatch(error)) return QUIET
            this.deps.warn?.("asking to start over", error)
            return { kind: "failed", during: "ask", error }
        } finally {
            this.hooks.step(null)
            this.running = false
        }
    }

    /** "Finish starting over", once the request matured. */
    async finish(requestId: string | null, refused: DeviceId | null): Promise<StartOverFlowResult> {
        if (this.running || !this.deps.session()) return QUIET
        this.running = true
        try {
            return await this.finishing(requestId, refused)
        } finally {
            this.running = false
        }
    }

    /** "Withdraw the request". */
    async withdraw(requestId: string): Promise<StartOverFlowResult> {
        const session = this.deps.session()
        if (this.running || !session) return QUIET
        this.running = true
        this.hooks.step("withdrawing")
        try {
            await this.deps.end(session, requestId)
            await this.hooks.reread()
            return QUIET
        } catch (error) {
            this.deps.warn?.("withdrawing the start over request", error)
            return { kind: "failed", during: "withdraw", error }
        } finally {
            this.hooks.step(null)
            this.running = false
        }
    }

    private async finishing(requestId: string | null, refused: DeviceId | null): Promise<StartOverFlowResult> {
        const session = this.deps.session()
        if (!session) return QUIET
        this.hooks.step("starting")
        try {
            const outcome = await this.deps.startOver(session, refused)
            switch (outcome.kind) {
                case "started-over":
                    return { kind: "started-over", words: outcome.words }
                case "recent-sign-in":
                    return { kind: "needs-recent-sign-in" }
                case "conflict":
                case "key-changed":
                    return { kind: "went-otherwise", how: outcome.kind }
                case "rolled-back":
                    return { kind: "rolled-back" }
                case "not-ready":
                    if (outcome.readyAt !== null && requestId) {
                        this.hooks.held(holdAfterRefusal(requestId, outcome.readyAt, this.now(), this.deps.clockLead(session)))
                    }
                    await this.hooks.reread()
                    return QUIET
                case "request-required":
                    await this.hooks.reread()
                    return QUIET
            }
        } catch (error) {
            if (await this.deps.signInAgainOnDeviceMismatch(error)) return QUIET
            this.deps.warn?.("starting over", error)
            // The new words may be set already, the IdP's answer lost.
            const unseen = await this.deps.newWordsToShow().catch(() => null)
            return unseen ? { kind: "started-over", words: unseen.words } : { kind: "failed", during: "finish", error }
        } finally {
            this.hooks.step(null)
        }
    }

    private now(): number {
        return this.deps.now?.() ?? Date.now()
    }
}
