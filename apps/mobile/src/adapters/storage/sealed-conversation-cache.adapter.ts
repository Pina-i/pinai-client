import type { SendState } from "@pinai/domain/models/dm"
import type { ReceivedText } from "@pinai/domain/models/received-message"
import type { CachedTimelineMessage, ConversationTimeline, IConversationCache } from "@pinai/domain/ports/conversation-cache.port"
import type { IDeviceKeyPort, SealedBytes } from "@pinai/domain/ports/device-key.port"
import type { IKeyValueStore } from "@pinai/domain/ports/key-value-store.port"

/** A store that lists a collection's keys, as the phone's SQLite does. */
export interface ListingKeyValueStore extends IKeyValueStore {
    keys(collection: string): Promise<string[]>
}

export interface SealedConversationCacheDeps<M> {
    store: ListingKeyValueStore
    key: IDeviceKeyPort
    toCached: (message: ReceivedText & SendState) => M
    report: (what: string, error: unknown) => void
}

type Change<M> = (held: ConversationTimeline<M>) => ConversationTimeline<M>

interface Entry<M> {
    /** The row as read, with every change since; absent until a read succeeded. */
    held?: ConversationTimeline<M>
    /** Changes made while the row couldn't be read, applied over it in order once it is. */
    waiting: Change<M>[]
    /** What the screens show: `held`, else the waiting changes over an empty timeline. */
    shown?: ConversationTimeline<M>
    /** `held` carries a change no write has landed yet. */
    unsaved: boolean
    writeFailed: boolean
    readWarned: boolean
    turns: Promise<void>
    writes: Promise<void>
    listeners: Set<() => void>
}

const COLLECTION = "conversations"
const FORMAT = 1
const NONCE_BYTES = 12

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * The account's conversations, one sealed row each: the only decrypted copy of its history, so a row is never written
 * before it was read, nor written over or deleted when it can't be.
 */
export class SealedConversationCache<M extends CachedTimelineMessage> implements IConversationCache<M> {
    private readonly deps: SealedConversationCacheDeps<M>
    private readonly entries = new Map<string, Entry<M>>()
    private closed = false

    constructor(deps: SealedConversationCacheDeps<M>) {
        this.deps = deps
    }

    readonly toCached = (message: ReceivedText & SendState): M => this.deps.toCached(message)

    read(conversationId: string): Promise<ConversationTimeline<M>> {
        return this.turn(conversationId, async (entry) => {
            await this.load(conversationId, entry)
            return entry.shown ?? emptyTimeline()
        })
    }

    update(conversationId: string, change: Change<M>): Promise<void> {
        return this.turn(conversationId, async (entry) => {
            if (await this.load(conversationId, entry)) {
                this.apply(conversationId, entry, change)
                return
            }
            entry.waiting.push(change)
            this.show(entry)
        })
    }

    async conversationIds(): Promise<string[]> {
        const ids = new Set<string>()
        try {
            for (const id of await this.deps.store.keys(COLLECTION)) ids.add(id)
        } catch (error) {
            this.deps.report("listing the saved conversations", error)
        }
        for (const [id, entry] of this.entries) {
            if ((entry.held?.messages.length ?? 0) > 0 || entry.waiting.length > 0) ids.add(id)
        }
        return [...ids]
    }

    /** What the screens show of a conversation: `undefined` until it was read or changed. */
    snapshot(conversationId: string): ConversationTimeline<M> | undefined {
        return this.entries.get(conversationId)?.shown
    }

    subscribe(conversationId: string, listener: () => void): () => void {
        const { listeners } = this.entry(conversationId)
        listeners.add(listener)
        return () => listeners.delete(listener)
    }

    /** The key loaded and the store answering: rows can be read. */
    async ready(): Promise<void> {
        await this.deps.key.ready()
        await this.deps.store.keys(COLLECTION)
    }

    /** Resolves once every change of these conversations is written, a failed read or write tried once more; else throws. */
    async saved(conversationIds: readonly string[]): Promise<void> {
        for (const id of conversationIds) {
            const entry = this.entries.get(id)
            if (!entry) continue
            await this.turn(id, async () => {
                if (!(await this.load(id, entry))) throw new Error(`The saved conversation ${id} can't be read`)
                if (entry.unsaved && entry.writeFailed) this.write(id, entry)
            })
            while (entry.unsaved && !entry.writeFailed) await entry.writes
            if (entry.unsaved) throw new Error(`The conversation ${id} couldn't be saved`)
        }
    }

    /** What waits tried again: the reads that failed, the writes that failed. */
    async flush(): Promise<void> {
        await Promise.all(
            [...this.entries].map(async ([id, entry]) => {
                await this.turn(id, async () => {
                    if (entry.waiting.length > 0) await this.load(id, entry)
                    if (entry.unsaved && entry.writeFailed) this.write(id, entry)
                }).catch(() => undefined)
                await entry.writes
            })
        )
    }

    /** What is under way finishes; nothing more is taken. */
    async close(): Promise<void> {
        this.closed = true
        await Promise.all(
            [...this.entries.values()].map(async (entry) => {
                await entry.turns
                await entry.writes
            })
        )
    }

    private entry(conversationId: string): Entry<M> {
        let entry = this.entries.get(conversationId)
        if (!entry) {
            entry = {
                waiting: [],
                unsaved: false,
                writeFailed: false,
                readWarned: false,
                turns: Promise.resolve(),
                writes: Promise.resolve(),
                listeners: new Set(),
            }
            this.entries.set(conversationId, entry)
        }
        return entry
    }

    // One read-modify-write at a time per conversation: each change runs over the last one's result.
    private turn<T>(conversationId: string, run: (entry: Entry<M>) => Promise<T>): Promise<T> {
        if (this.closed) return Promise.reject(new Error("This account's conversations are closed"))
        const entry = this.entry(conversationId)
        const next = entry.turns.then(() => run(entry))
        entry.turns = next.then(
            () => undefined,
            () => undefined
        )
        return next
    }

    private async load(conversationId: string, entry: Entry<M>): Promise<boolean> {
        if (entry.held) return true
        let row: ConversationTimeline<M> | undefined
        try {
            row = await this.readRow(conversationId)
        } catch (error) {
            if (!entry.readWarned) this.deps.report(`reading the saved conversation ${conversationId}; its changes kept until it reads`, error)
            entry.readWarned = true
            return false
        }
        entry.readWarned = false
        entry.held = row ?? emptyTimeline()
        for (const change of entry.waiting.splice(0)) this.apply(conversationId, entry, change)
        this.show(entry)
        return true
    }

    private apply(conversationId: string, entry: Entry<M>, change: Change<M>): void {
        const held = entry.held as ConversationTimeline<M>
        const next = change(held)
        if (sameTimeline(held, next)) return
        entry.held = next
        entry.unsaved = true
        this.show(entry)
        this.write(conversationId, entry)
    }

    // Each write takes the newest timeline: those queued behind one that carried it find nothing left to write.
    private write(conversationId: string, entry: Entry<M>): void {
        entry.writeFailed = false
        entry.writes = entry.writes.then(async () => {
            const timeline = entry.held
            if (!entry.unsaved || !timeline) return
            entry.unsaved = false
            try {
                await this.writeRow(conversationId, timeline)
            } catch (error) {
                entry.unsaved = true
                entry.writeFailed = true
                this.deps.report(`saving the conversation ${conversationId}; kept in memory, tried again`, error)
            }
        })
    }

    private show(entry: Entry<M>): void {
        const shown = entry.held ?? entry.waiting.reduce((timeline, change) => change(timeline), emptyTimeline<M>())
        if (shown === entry.shown) return
        entry.shown = shown
        for (const listener of entry.listeners) listener()
    }

    private async readRow(conversationId: string): Promise<ConversationTimeline<M> | undefined> {
        await this.deps.key.ready()
        const bytes = await this.deps.store.get(COLLECTION, conversationId)
        if (!bytes) return undefined
        const plain = await this.deps.key.open(unframe(bytes))
        const timeline = decodeTimeline<M>(decoder.decode(plain))
        if (!timeline) throw new Error("Not a conversation row this app writes")
        return timeline
    }

    private async writeRow(conversationId: string, timeline: ConversationTimeline<M>): Promise<void> {
        const sealed = await this.deps.key.seal(encoder.encode(encodeTimeline(timeline)))
        await this.deps.store.put(COLLECTION, conversationId, frame(sealed))
    }
}

function emptyTimeline<M>(): ConversationTimeline<M> {
    return { messages: [], appliedReactionIds: {}, groupEvents: [], newDeviceLines: [] }
}

function sameTimeline<M>(a: ConversationTimeline<M>, b: ConversationTimeline<M>): boolean {
    return a.messages === b.messages && a.appliedReactionIds === b.appliedReactionIds && a.groupEvents === b.groupEvents && a.newDeviceLines === b.newDeviceLines
}

function frame(sealed: SealedBytes): Uint8Array {
    const out = new Uint8Array(sealed.nonce.length + sealed.ciphertext.length)
    out.set(sealed.nonce, 0)
    out.set(sealed.ciphertext, sealed.nonce.length)
    return out
}

function unframe(bytes: Uint8Array): SealedBytes {
    return { nonce: bytes.subarray(0, NONCE_BYTES), ciphertext: bytes.subarray(NONCE_BYTES) }
}

// Attachment keys are bytes, which plain JSON writes as an object of indices no cipher takes back.
export function encodeTimeline<M>(timeline: ConversationTimeline<M>): string {
    const row = {
        v: FORMAT,
        messages: timeline.messages,
        appliedReactionIds: timeline.appliedReactionIds,
        groupEvents: timeline.groupEvents,
        newDeviceLines: timeline.newDeviceLines,
    }
    return JSON.stringify(row, (_key, value: unknown) => (value instanceof Uint8Array ? { $bytes: Array.from(value) } : value))
}

/** `null` for anything that isn't a row this app writes. */
export function decodeTimeline<M>(json: string): ConversationTimeline<M> | null {
    let value: unknown
    try {
        value = JSON.parse(json, (_key, v: unknown) => (isRecord(v) && isByteList(v.$bytes) && Object.keys(v).length === 1 ? Uint8Array.from(v.$bytes) : v))
    } catch {
        return null
    }
    if (!isRecord(value) || value.v !== FORMAT) return null
    const { messages, appliedReactionIds, groupEvents, newDeviceLines } = value
    if (!Array.isArray(messages) || !messages.every(isMessage)) return null
    if (!isRecord(appliedReactionIds) || !Array.isArray(groupEvents) || !Array.isArray(newDeviceLines)) return null
    return {
        messages: messages as M[],
        appliedReactionIds: appliedReactionIds as Record<string, true>,
        groupEvents,
        newDeviceLines,
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array)
}

function isByteList(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
}

function isMessage(value: unknown): boolean {
    return isRecord(value) && typeof value.id === "string" && typeof value.createdAt === "string"
}
