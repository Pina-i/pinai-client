import { renewAfter } from "../../models/auth"
import type { Renewal } from "./renew-session.usecase"

/** How often a platform looks at the wall clock: a timer stops while the device sleeps. */
export const SESSION_TICK_MS = 10_000
/** Soon enough that a renewal whose answer was lost is tried again within the IdP's minute of grace. */
export const RENEWAL_RETRY_MS = 15_000

export interface SessionKeeperDeps {
    /** The one renewal of the page or the app ({@link renewSessionUseCase}, or the desktop's main process). */
    renew: () => Promise<Renewal>
    /** Who is signed in now, `null` for nobody: an answer reaching anyone else is dropped. */
    signedIn: () => string | null
    renewed: (accessToken: string) => void
    /** The IdP refused the session: called once, until a new session's token is tracked. */
    ended: () => void
    now?: () => number
}

/**
 * Keeps a signed-in session going: renews its access token once {@link renewAfter} says, when the
 * platform asks it (its tick, the app back in front, back online) or when the IdP refuses a
 * request. The triggers are the platform's; when, and what an answer means, are these.
 */
export class SessionKeeper {
    private readonly deps: SessionKeeperDeps
    private scheduledFor: string | null = null
    private arrivedAt = 0
    private dueAt = Number.POSITIVE_INFINITY
    private ending = false

    constructor(deps: SessionKeeperDeps) {
        this.deps = deps
    }

    /** The access token in use: a new one is scheduled from its arrival, now. */
    track(token: string | null): void {
        if (token && token !== this.scheduledFor) this.schedule(token)
    }

    renewIfDue(): void {
        if (this.now() >= this.dueAt) void this.renewNow()
    }

    /** Renews at once. The new access token, or `null`. */
    async renewNow(): Promise<string | null> {
        const signedIn = this.deps.signedIn()
        if (!signedIn || this.ending) return null
        const renewal = await this.deps.renew()
        if (this.deps.signedIn() !== signedIn) return null
        switch (renewal.kind) {
            case "renewed":
                this.schedule(renewal.accessToken)
                this.deps.renewed(renewal.accessToken)
                return renewal.accessToken
            case "unreachable":
                this.dueAt = this.now() + RENEWAL_RETRY_MS
                return null
            case "ended":
                this.ending = true
                this.dueAt = Number.POSITIVE_INFINITY
                this.deps.ended()
                return null
        }
    }

    /** When `token` arrived, on this device's clock; `null` for a token it doesn't track. */
    arrivalOf(token: string | null): number | null {
        return token !== null && token === this.scheduledFor ? this.arrivedAt : null
    }

    private schedule(token: string): void {
        const delay = renewAfter(token)
        this.scheduledFor = token
        this.arrivedAt = this.now()
        this.dueAt = delay === null ? Number.POSITIVE_INFINITY : this.arrivedAt + delay
        this.ending = false
    }

    private now(): number {
        return this.deps.now?.() ?? Date.now()
    }
}
