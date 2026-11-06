import {
    REARCHIVE_PACE_MS,
    REARCHIVE_RETRY_DELAYS_MS,
    conversationEntries,
    dueRearchive,
    rearchiveBatches,
    rearchiveConversations,
    rearchiveProgress,
    rearchiveRefusal,
    remainingAfter,
    type CachedMessage,
    type RearchiveDue,
    type RearchiveEntry,
} from "../../models/history-rearchive"
import type { IE2eePort, SealedRearchive } from "../../ports/e2ee.port"

export type HistoryRearchiveState =
    | { kind: "idle" }
    /** `done` of `total` messages: what the cursor had reached, then each batch taken. */
    | { kind: "rearchiving"; generation: number; done: number; total: number }
    /** `skipped`: messages in batches the IdP refused for good. */
    | { kind: "rearchived"; generation: number; messages: number; skipped: number }
    /** A later generation is in force: what was re-made went with the archive it erased. */
    | { kind: "abandoned"; generation: number }
    /** The instance doesn't count this device approved yet (`approval_required`): the cursor kept, untried for a later call. */
    | { kind: "paused"; generation: number }
    | { kind: "signed-out"; generation: number }
    | { kind: "failed"; generation: number; error: unknown }

/** This device's copy of its conversations, and the account's address the cache marks the user's reactions by. */
export interface LocalHistory {
    me: string
    conversations: Readonly<Record<string, readonly CachedMessage[]>>
}

/** Held across the account's tabs while `run` runs, the others waiting. */
export type RearchiveLock = <T>(run: () => Promise<T>) => Promise<T>

export interface HistoryRearchiveDeps {
    e2ee: Pick<
        IE2eePort,
        | "historyRearchiveDue"
        | "historyKeyStanding"
        | "checkHistoryKey"
        | "sealForRearchive"
        | "uploadRearchive"
        | "advanceHistoryRearchive"
        | "historyRearchived"
    >
    /** Resolves once this page load's cache was read back; `null` when there is none to read. */
    localHistory: () => Promise<LocalHistory | null>
    sleep: (ms: number) => Promise<void>
    /** The instant a run's reaction snapshots are taken at; `Date.now` by default. */
    now?: () => number
    /** One tab at a time: a cursor never goes back. */
    lock?: RearchiveLock
}

export interface HistoryRearchiveContext {
    idpUrl: string
    accessToken: () => string | null
}

type Sent = "sent" | "skipped" | "abandon"

class SignedOut extends Error {}
class NotHeld extends Error {}
class Unapproved extends Error {}

/** Once per page load and generation, but for a run cut short by no answer: a later call tries it again. */
export class HistoryRearchive {
    state: HistoryRearchiveState = { kind: "idle" }

    private readonly deps: HistoryRearchiveDeps
    private running: Promise<HistoryRearchiveState> | null = null
    private rerun = false
    private readonly tried = new Set<number>()
    private readonly listeners = new Set<() => void>()

    constructor(deps: HistoryRearchiveDeps) {
        this.deps = deps
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /**
     * A call while one runs is that run, which looks once more as it ends — at a re-archive marked
     * meanwhile, or one a signal let go on after the run paused or found the device not approved.
     */
    run(context: HistoryRearchiveContext): Promise<HistoryRearchiveState> {
        if (this.running) {
            this.rerun = true
            return this.running
        }
        const runs = async () => {
            let state: HistoryRearchiveState
            do {
                this.rerun = false
                state = await this.loop(context)
            } while (this.rerun)
            return state
        }
        const { lock } = this.deps
        this.running = (lock ? lock(runs) : runs()).finally(() => {
            this.running = null
        })
        return this.running
    }

    private async loop(context: HistoryRearchiveContext): Promise<HistoryRearchiveState> {
        const { e2ee } = this.deps
        // One left untried is for a later call, never this one.
        const attempted = new Set<number>()
        for (;;) {
            const due = await e2ee.historyRearchiveDue()
            if (!due || this.tried.has(due.generation) || attempted.has(due.generation)) return this.state
            const verdict = dueRearchive(due.generation, await e2ee.historyKeyStanding())
            if (verdict === "abandon") {
                this.tried.add(due.generation)
                await e2ee.historyRearchived(due.generation)
                continue
            }
            if (verdict !== "rearchive" || !context.accessToken()) return this.state
            const local = await this.deps.localHistory()
            if (!local) return this.state
            this.tried.add(due.generation)
            attempted.add(due.generation)
            await this.rearchive(context, due, local)
        }
    }

    private async rearchive(context: HistoryRearchiveContext, due: RearchiveDue, local: LocalHistory): Promise<void> {
        const { e2ee } = this.deps
        const { generation, cursor } = due
        const asOf = new Date((this.deps.now ?? Date.now)()).toISOString()
        const progress = rearchiveProgress(local.conversations, cursor)
        let done = progress.done
        let skipped = 0
        let paced = false
        if (done < progress.total) this.set({ kind: "rearchiving", generation, done, total: progress.total })
        try {
            for (const { conversationId, key } of rearchiveConversations(local.conversations)) {
                if (cursor && conversationId < cursor.conversationId) continue
                const entries = conversationEntries(conversationId, local.conversations[key], local.me, asOf)
                for (const batch of rearchiveBatches(remainingAfter(entries, cursor))) {
                    if (paced) await this.deps.sleep(REARCHIVE_PACE_MS)
                    paced = true
                    const sent = await this.send(context, generation, batch)
                    if (sent === "abandon") {
                        await e2ee.historyRearchived(generation)
                        this.set({ kind: "abandoned", generation })
                        return
                    }
                    const closed = batch.filter((entry) => entry.closesMessage).length
                    if (sent === "skipped") skipped += closed
                    await e2ee.advanceHistoryRearchive(generation, batch[batch.length - 1].position)
                    done += closed
                    this.set({ kind: "rearchiving", generation, done, total: progress.total })
                }
            }
            await e2ee.historyRearchived(generation)
            this.set({ kind: "rearchived", generation, messages: progress.total - skipped, skipped })
        } catch (error) {
            if (error instanceof SignedOut || !context.accessToken()) {
                this.tried.delete(generation)
                this.set({ kind: "signed-out", generation })
                return
            }
            const refusal = error instanceof Unapproved ? "wait" : rearchiveRefusal(error)
            if (refusal === "wait") {
                this.tried.delete(generation)
                this.set({ kind: "paused", generation })
                return
            }
            if (refusal === "retry") this.tried.delete(generation)
            this.set({ kind: "failed", generation, error })
        }
    }

    private async send(context: HistoryRearchiveContext, generation: number, entries: RearchiveEntry[]): Promise<Sent> {
        const { e2ee } = this.deps
        let sealed: SealedRearchive | null = null
        let failures = 0
        let keyReadAgain = false
        for (;;) {
            const accessToken = context.accessToken()
            if (!accessToken) throw new SignedOut()
            sealed ??= await e2ee.sealForRearchive(generation, entries)
            try {
                if (!sealed) throw new NotHeld()
                await e2ee.uploadRearchive(context.idpUrl, accessToken, sealed)
                return "sent"
            } catch (error) {
                const meaning = error instanceof NotHeld ? "stale" : rearchiveRefusal(error)
                if (meaning === "skip") return "skipped"
                if (meaning === "retry") {
                    const delay = REARCHIVE_RETRY_DELAYS_MS[failures++]
                    if (delay === undefined) throw error
                    await this.deps.sleep(delay)
                    continue
                }
                if (meaning !== "stale") throw error
                const verdict = dueRearchive(generation, await e2ee.checkHistoryKey(context.idpUrl, accessToken))
                if (verdict === "abandon") return "abandon"
                if (verdict === "unapproved") throw new Unapproved()
                if (verdict === "wait" || keyReadAgain) throw error
                keyReadAgain = true
            }
        }
    }

    private set(state: HistoryRearchiveState): void {
        this.state = state
        for (const listener of this.listeners) listener()
    }
}
