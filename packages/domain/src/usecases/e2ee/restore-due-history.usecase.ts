import { restoredMessages, type RestoredMessage } from "../../models/history-archive"
import { dueRestore } from "../../models/history-key"
import type { IE2eePort } from "../../ports/e2ee.port"

export type HistoryRestoreState =
    | { kind: "idle" }
    | { kind: "restoring"; generation: number }
    | { kind: "restored"; generation: number; messages: number; skipped: number }
    | { kind: "failed"; generation: number; error: unknown }

export interface HistoryRestoreDeps {
    e2ee: Pick<IE2eePort, "historyRestoreDue" | "historyKeyStanding" | "restoreHistory" | "historyRestoreApplied" | "historyRestored">
    /** Resolves once this page load's cache was read back and applied; never when the read failed. */
    cacheReady?: () => Promise<void>
}

export interface HistoryRestoreContext {
    idpUrl: string
    accessToken: () => string | null
}

/**
 * The archive restored once the words were kept — by a key share or typed (`identity-provider/specs/e2ee.md
 * § 6.4`, § 6.10) —: one run at a time, over a cache read back, the messages handed to `apply`.
 * Applied, the restore stays due: the cache's write may not have landed. A later page load, its
 * cache read back, runs it again — messages dedupe by id, reactions by theirs — and only then is it
 * done; that run shows nothing. A run that fails stays due for the next start.
 */
export class HistoryRestore {
    state: HistoryRestoreState = { kind: "idle" }

    private readonly deps: HistoryRestoreDeps
    private running: Promise<HistoryRestoreState> | null = null
    private failedUnder: number | null = null
    private appliedUnder: number | null = null
    private readonly listeners = new Set<() => void>()

    constructor(deps: HistoryRestoreDeps) {
        this.deps = deps
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /** A call while one runs is that run. */
    run(context: HistoryRestoreContext, apply: (messages: RestoredMessage[]) => void | Promise<void>): Promise<HistoryRestoreState> {
        this.running ??= this.step(context, apply).finally(() => {
            this.running = null
        })
        return this.running
    }

    private async step(context: HistoryRestoreContext, apply: (messages: RestoredMessage[]) => void | Promise<void>): Promise<HistoryRestoreState> {
        const { e2ee } = this.deps
        const due = await e2ee.historyRestoreDue()
        if (!due || due.generation === this.failedUnder || due.generation === this.appliedUnder) return this.state
        const verdict = dueRestore(due.generation, await e2ee.historyKeyStanding())
        if (verdict === "moot") await e2ee.historyRestored(due.generation)
        if (verdict !== "restore" || !context.accessToken()) return this.state
        await this.deps.cacheReady?.()
        const accessToken = context.accessToken()
        if (!accessToken) return this.state
        const confirming = due.appliedAt !== null
        if (!confirming) this.set({ kind: "restoring", generation: due.generation })
        try {
            const { entries, skipped } = await e2ee.restoreHistory(context.idpUrl, accessToken)
            const messages = restoredMessages(entries)
            await apply(messages)
            if (confirming) {
                await e2ee.historyRestored(due.generation)
                return this.state
            }
            await e2ee.historyRestoreApplied(due.generation)
            this.appliedUnder = due.generation
            return this.set({ kind: "restored", generation: due.generation, messages: messages.length, skipped })
        } catch (error) {
            this.failedUnder = due.generation
            return confirming ? this.state : this.set({ kind: "failed", generation: due.generation, error })
        }
    }

    private set(state: HistoryRestoreState): HistoryRestoreState {
        this.state = state
        for (const listener of this.listeners) listener()
        return state
    }
}
