/**
 * The archive re-made from this device's own copy after its words were replaced (the design's 18i3;
 * `identity-provider/specs/e2ee.md § 3.8`, § 7.3): which cached messages become which entries — each
 * text once, its latest, marked edited, its attachments' keys with it; one reaction snapshot per
 * message with reactions, under an id only the words' holders compute; no placeholder, no send the
 * IdP never stored —, sealed under the new generation with the archive's associated data and
 * restored by another device through the real restore path, a snapshot — dated by its archive row,
 * on the IdP's clock — the base its named reactions since come on top of; the cursor kept after each batch, so a run cut short goes on from there;
 * pacing and back-off on fake timers; a later generation dropping it, `stale_history_key` reading the
 * key again; one tab at a time. Real E2EE engines over fakes keeping the IdP's rules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sha256 } from "@noble/hashes/sha2.js"

import { archiveEntryAad } from "@pinai/crypto/canonical-bytes"
import type { UserProfile } from "@pinai/domain/models/auth"
import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import {
    archivedReaction,
    archivedReactionSnapshot,
    archivedText,
    decodeArchiveEnvelope,
    editEntryId,
    restoredMessages,
    type ArchivedEntry,
} from "@pinai/domain/models/history-archive"
import {
    REARCHIVE_PACE_MS,
    REARCHIVE_RETRY_DELAYS_MS,
    conversationEntries,
    dueRearchive,
    parseRearchiveDue,
    rearchiveBatches,
    rearchiveConversations,
    rearchiveProgress,
    rearchiveRefusal,
    remainingAfter,
    type CachedMessage,
} from "@pinai/domain/models/history-rearchive"
import { IdpError } from "@pinai/domain/models/idp-error"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { HistoryRearchive, type HistoryRearchiveState, type RearchiveLock } from "@pinai/domain/usecases/e2ee/rearchive-history.usecase"
import { replaceWordsUseCase } from "@pinai/domain/usecases/e2ee/replace-words.usecase"
import { HistoryRestore } from "@pinai/domain/usecases/e2ee/restore-due-history.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { replayRestoredHistory } from "@/presentation/_libs/replay-restored-history"
import type { Message } from "@/lib/types"
import { useAppStore } from "@/store/store"

import { accessToken } from "./setup/access-token"
import { ACTOR, FakeHistoryIdp, IDP, historyDevice } from "./setup/history-idp"

const ME = "alice_xk9mp@idp.test"
const BOB = "bob_a1b2c@idp.test"
const C1 = "11112222-3333-4444-5555-666677778888"
const C2 = "aaaabbbb-cccc-4ddd-8eee-ffff00001111"
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const T0 = Date.UTC(2026, 9, 1, 10, 0, 0)
const at = (n: number) => new Date(T0 + n * 1000).toISOString()
const AS_OF = new Date(T0 + 3_600_000).toISOString()

const KEY: AttachmentBlobKey = {
    id: "5f0c3c2e-2d2b-4c1a-9e1f-0a0b0c0d0e0f",
    key: new Uint8Array(32).fill(9),
    nonce: new Uint8Array(12).fill(4),
    original_filename: "reef.jpg",
    mime_type: "image/jpeg",
    byte_size: 1234,
}
const LISTED = { id: KEY.id, mime_type: "application/octet-stream", byte_size: 1262, original_filename: "encrypted" }

function message(n: number, overrides: Partial<CachedMessage> = {}): CachedMessage {
    return { id: id(n), author: "Bob", authorAddress: BOB, content: `text ${n}`, createdAt: at(n), ...overrides }
}

/** A conversation with an edit, an attachment, reactions — the user's among them — and a reply, beside what isn't archived. */
function conversation(): CachedMessage[] {
    return [
        message(1),
        message(2, { author: "Alice", authorAddress: ME, content: "the latest text", edited: true, status: "sent" }),
        message(3, { content: "look", attachments: [LISTED], attachmentKeys: { [KEY.id]: KEY } }),
        message(4, {
            reactions: [
                { emoji: "👍", count: 3, reacted: true },
                { emoji: "🔥", count: 1, reacted: false },
            ],
        }),
        message(5, { replyTo: { id: id(1), content: "text 1", author: "Bob" } }),
        message(6, { content: "[encrypted]", undecrypted: true }),
        message(7, { content: "[encrypted]" }),
        message(8, { author: "Alice", authorAddress: ME, status: "failed" }),
        message(9, { author: "Alice", authorAddress: ME, status: "sending" }),
    ]
}

const many = (count: number, from = 100) => Array.from({ length: count }, (_, i) => message(from + i))

/** Every entry the cache gives, conversation by conversation. */
const plan = (cache: Record<string, CachedMessage[]>, asOf = AS_OF) =>
    rearchiveConversations(cache).flatMap(({ conversationId, key }) => conversationEntries(conversationId, cache[key], ME, asOf))

type Device = ReturnType<typeof historyDevice>

const replaceDeps = (device: Device) => ({ ...device.deps, cacheRead: () => true, applyRestored: async () => undefined })

async function replace(device: Device) {
    const outcome = await replaceWordsUseCase(replaceDeps(device))({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR, tokenArrivedAt: Date.now() })
    if (outcome.kind !== "replaced") throw new Error(`not replaced: ${outcome.kind}`)
    return outcome.words
}

/** The laptop holding generation 1, which then replaced its words: generation 2, the re-archive due. */
async function replaced() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop")
    await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    const words = await replace(laptop)
    return { idp, laptop, words }
}

const timer = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** No waiting unless `paced`: then the platform's timers, faked by the test. */
function rearchiving(
    device: Device,
    conversations: Record<string, CachedMessage[]>,
    options: { paced?: boolean; now?: number; lock?: RearchiveLock } = {},
) {
    return new HistoryRearchive({
        e2ee: device.e2ee,
        localHistory: async () => ({ me: ME, conversations }),
        sleep: options.paced ? timer : async () => undefined,
        now: () => options.now ?? T0 + 3_600_000,
        ...(options.lock ? { lock: options.lock } : {}),
    })
}

const context = (device: Device) => ({ idpUrl: IDP, accessToken: () => device.token })

/** Fake timers run until `promise` settles. */
async function settle<T>(promise: Promise<T>): Promise<T> {
    let done = false
    void promise.then(
        () => (done = true),
        () => (done = true),
    )
    for (let i = 0; i < 500 && !done; i++) await vi.advanceTimersByTimeAsync(1_000)
    expect(done).toBe(true)
    return promise
}

/** What is due now runs, the clock standing still. */
async function flush() {
    for (let i = 0; i < 100; i++) await vi.advanceTimersByTimeAsync(0)
}

/** One lock for the account's tabs, as the platform's would be. */
function sharedLock(): RearchiveLock {
    let last: Promise<unknown> = Promise.resolve()
    return <T>(run: () => Promise<T>) => {
        const mine = last.then(run, run)
        last = mine.catch(() => undefined)
        return mine
    }
}

/** A restoring device's store: the real restore path's apply, into an empty cache. */
async function restoreInto(entries: ArchivedEntry[]) {
    useAppStore.setState({ user: { address: ME } as UserProfile, dmMessages: {}, appliedReactionIds: {} })
    await replayRestoredHistory(restoredMessages(entries))
    return useAppStore.getState()
}

const entry = (conversationId: string, entryId: string, envelope: ArchivedEntry["envelope"], archivedAt?: string): ArchivedEntry => ({
    conversationId,
    id: entryId,
    envelope,
    ...(archivedAt ? { archivedAt } : {}),
})

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("the entries a cached conversation gives", () => {
    it("each text once — its latest, marked edited, its attachments' keys with it, its reply —, then one snapshot of a message's reactions", () => {
        const entries = plan({ [C1]: conversation() })

        const texts = entries.filter((e) => e.envelope.app.kind === "text")
        expect(texts.map((e) => e.id)).toEqual([id(1), id(2), id(3), id(4), id(5)])
        const [first, edited, attached, , reply] = texts.map((e) => e.envelope)
        expect(first).toEqual({ v: 1, sender_address: BOB, sender_display_name: "Bob", created_at: at(1), app: { version: 1, kind: "text", body: { text: "text 1" } } })
        expect(edited.edited).toBe(true)
        expect(edited.app.body).toEqual({ text: "the latest text" })
        expect(attached.attachments).toEqual([LISTED])
        expect(attached.app.body).toEqual({ text: "look", attachments: [KEY] })
        expect(reply.app.body).toMatchObject({ reply_meta: { target_message_id: id(1), preview_text: "text 1", preview_sender: "Bob" } })

        const snapshots = entries.filter((e) => e.envelope.app.kind === "reaction-snapshot")
        expect(snapshots).toHaveLength(1)
        expect(snapshots[0].id).toEqual({ reactionsOf: id(4) })
        expect(snapshots[0].envelope).toEqual({
            v: 1,
            sender_address: ME,
            created_at: AS_OF,
            app: {
                version: 1,
                kind: "reaction-snapshot",
                body: {
                    target_message_id: id(4),
                    as_of: AS_OF,
                    reactions: [
                        { emoji: "👍", count: 3, reacted: true },
                        { emoji: "🔥", count: 1, reacted: false },
                    ],
                },
            },
        })
        expect(entries.filter((e) => e.closesMessage).map((e) => e.position)).toContainEqual({ conversationId: C1, at: Date.parse(at(4)), messageId: id(4), part: 1 })
        expect(entries.some((e) => e.envelope.app.kind === "reaction")).toBe(false)
    })

    it("leaves out undecrypted placeholders and sends the IdP never stored", () => {
        const ids = new Set(plan({ [C1]: conversation() }).map((e) => e.position.messageId))
        for (const skipped of [6, 7, 8, 9]) expect(ids.has(id(skipped))).toBe(false)
    })

    it("in one order every run finds again — conversations by id, messages by instant then id —, a message met twice once", () => {
        expect(plan({ [C2]: [message(21), message(20)], [C1]: [message(2), message(1), message(1)] }).map((e) => [e.conversationId, e.position.messageId])).toEqual([
            [C1, id(1)],
            [C1, id(2)],
            [C2, id(20)],
            [C2, id(21)],
        ])
    })

    it("counts progress in messages without building an entry: a message is done once its snapshot is", () => {
        const reacted = message(1, { reactions: [{ emoji: "👍", count: 1, reacted: false }] })
        const cache = { [C1]: [reacted, message(2)], [C2]: many(3, 300) }
        const [text, snapshot] = plan(cache)

        expect(rearchiveProgress(cache, null)).toEqual({ done: 0, total: 5 })
        expect(rearchiveProgress(cache, text.position)).toEqual({ done: 0, total: 5 })
        expect(rearchiveProgress(cache, snapshot.position)).toEqual({ done: 1, total: 5 })
        expect(rearchiveProgress(cache, { conversationId: C2, at: 0, messageId: id(0), part: 0 })).toEqual({ done: 2, total: 5 })
    })

    it("goes on after a cursor, and batches one conversation at a time, 50 at most", () => {
        const cache = { [C1]: many(120), [C2]: many(3, 300) }
        const batches = rearchiveBatches(plan(cache))
        expect(batches.map((b) => [b[0].conversationId, b.length])).toEqual([
            [C1, 50],
            [C1, 50],
            [C1, 20],
            [C2, 3],
        ])
        expect(remainingAfter(plan(cache), batches[1][49].position)).toEqual([...batches[2], ...batches[3]])
    })

    it("is due while the generation is held, dropped once a later one is in force, waits otherwise", () => {
        expect(dueRearchive(2, { kind: "holds", generation: 2, settled: true })).toBe("rearchive")
        expect(dueRearchive(2, { kind: "mismatch", generation: 3, setByDevice: "x", reason: "check-value", held: 2 })).toBe("abandon")
        expect(dueRearchive(2, { kind: "mismatch", generation: 2, setByDevice: "x", reason: "check-value", held: 2 })).toBe("wait")
        expect(dueRearchive(2, { kind: "unchecked" })).toBe("wait")
    })

    it("tries again what may pass, reads the key again on stale, skips what is refused for good, stops otherwise", () => {
        expect(rearchiveRefusal(new IdpError(429, "too_many_requests", ""))).toBe("retry")
        expect(rearchiveRefusal(new IdpError(503, "unavailable", ""))).toBe("retry")
        expect(rearchiveRefusal(new TypeError("Failed to fetch"))).toBe("retry")
        expect(rearchiveRefusal(new IdpError(409, "stale_history_key", ""))).toBe("stale")
        expect(rearchiveRefusal(new IdpError(403, "access_denied", ""))).toBe("skip")
        expect(rearchiveRefusal(new IdpError(401, "invalid_token", ""))).toBe("stop")
        expect(rearchiveRefusal(new Error("what"))).toBe("stop")
    })

    it("reads back only a row it wrote", () => {
        const due = { generation: 2, cursor: { conversationId: C1, at: 5, messageId: id(1), part: 1 } }
        expect(parseRearchiveDue(JSON.parse(JSON.stringify(due)))).toEqual(due)
        expect(parseRearchiveDue({ generation: 2, cursor: null })).toEqual({ generation: 2, cursor: null })
        expect(parseRearchiveDue({ generation: 0, cursor: null })).toBeNull()
        expect(parseRearchiveDue({ generation: 2, cursor: { ...due.cursor, part: -1 } })).toBeNull()
        expect(parseRearchiveDue({ generation: 2, cursor: { ...due.cursor, messageId: "nope" } })).toBeNull()
    })
})

describe("restoring a snapshot", () => {
    const text = entry(C1, id(4), archivedText({ address: BOB, displayName: "Bob" }, at(4), { text: "text 4" }, undefined))
    // Its plaintext `as_of` is the sealing device's clock, set far off here: the archive row dates it.
    const snapshot = (reactions: Array<{ emoji: string; count: number; reacted: boolean }>, archivedAt = AS_OF, n = 1) =>
        entry(
            C1,
            `aaaaaaaa-0000-8000-8000-00000000000${n}`,
            archivedReactionSnapshot({ address: ME }, { target_message_id: id(4), as_of: "1999-01-01T00:00:00.000Z", reactions }),
            archivedAt,
        )
    const named = (n: number, reactor: string, emoji: string, op: "add" | "remove", createdAt: string) =>
        entry(C1, id(900 + n), archivedReaction({ address: reactor }, createdAt, { target_message_id: id(4), emoji, op }))
    const before = new Date(T0 + 60_000).toISOString()
    const after = new Date(T0 + 7_200_000).toISOString()

    it("counts the flusher's own copy of a reaction the snapshot holds once, recording its id", async () => {
        const entries = [text, snapshot([{ emoji: "👍", count: 1, reacted: false }]), named(1, BOB, "👍", "add", before)]

        const [restored] = restoredMessages(entries)
        expect(restored.reactions).toEqual([])
        expect(restored.reactionSnapshot).toEqual({ reactions: [{ emoji: "👍", count: 1, reacted: false }], since: [], counted: [id(901)] })

        const store = await restoreInto(entries)
        expect(store.dmMessages[C1][0].reactions).toEqual([{ emoji: "👍", count: 1, reacted: false }])
        expect(store.appliedReactionIds[id(901)]).toBe(true)
    })

    it("applies the named reactions dated after it on top: a remove, an add, the user's own", async () => {
        const entries = [
            text,
            snapshot([
                { emoji: "👍", count: 2, reacted: true },
                { emoji: "🔥", count: 1, reacted: false },
            ]),
            named(1, BOB, "🔥", "remove", after),
            named(2, ME, "👍", "remove", after),
            named(3, BOB, "🌺", "add", after),
        ]

        const store = await restoreInto(entries)
        expect(store.dmMessages[C1][0].reactions).toEqual([
            { emoji: "👍", count: 1, reacted: false },
            { emoji: "🌺", count: 1, reacted: false },
        ])
    })

    it("a late decrypt of a reaction counted in it adds nothing", async () => {
        const store = await restoreInto([text, snapshot([{ emoji: "👍", count: 1, reacted: false }]), named(1, BOB, "👍", "add", before)])
        store.applyReaction(C1, { reaction_message_id: id(901), target_message_id: id(4), reactor_address: BOB, emoji: "👍", op: "add" }, false)
        expect(useAppStore.getState().dmMessages[C1][0].reactions).toEqual([{ emoji: "👍", count: 1, reacted: false }])
    })

    it("of two snapshots of one message, the latest archive row wins", () => {
        const [restored] = restoredMessages([
            text,
            snapshot([{ emoji: "🌺", count: 9, reacted: false }], new Date(T0 + 60_000).toISOString(), 1),
            snapshot([{ emoji: "👍", count: 2, reacted: true }], AS_OF, 2),
        ])
        expect(restored.reactionSnapshot?.reactions).toEqual([{ emoji: "👍", count: 2, reacted: true }])
    })

    it("without a snapshot, folds the named reactions as before", () => {
        const [restored] = restoredMessages([text, named(1, BOB, "👍", "add", before), named(2, BOB, "👍", "remove", after), named(3, ME, "🔥", "add", after)])
        expect(restored.reactionSnapshot).toBeNull()
        expect(restored.reactions).toEqual([{ id: id(903), emoji: "🔥", reactorAddress: ME }])
    })

    it("a held copy wins over the snapshot", async () => {
        useAppStore.setState({
            user: { address: ME } as UserProfile,
            dmMessages: { [C1]: [{ ...(message(4) as Message), reactions: [{ emoji: "🌺", count: 1, reacted: true }] }] },
            appliedReactionIds: {},
        })
        await replayRestoredHistory(restoredMessages([text, snapshot([{ emoji: "👍", count: 4, reacted: false }])]))
        expect(useAppStore.getState().dmMessages[C1][0].reactions).toEqual([{ emoji: "🌺", count: 1, reacted: true }])
    })
})

describe("re-archiving after a replacement", () => {
    it("seals every entry under the new generation, bound to its ids, and another device holding it restores the same messages", async () => {
        const { idp, laptop, words } = await replaced()
        const cache = { [C1]: conversation(), [C2]: [message(30, { author: "Alice", authorAddress: ME })] }

        const state = await rearchiving(laptop, cache).run(context(laptop))

        expect(state).toEqual({ kind: "rearchived", generation: 2, messages: 6, skipped: 0 })
        expect(laptop.storage.rearchiveDue).toBeNull()
        expect(new Set(idp.uploads.map((u) => u.generation))).toEqual(new Set([2]))
        expect(idp.archive.size).toBe(plan(cache).length)

        // AES-256-GCM under the new words' HAK, the entry's ids as associated data — and those only.
        const hak = await laptop.sealer.deriveKey(words, idp.key!.salt)
        const sealed = idp.archive.get(id(3))!
        const opened = await laptop.sealer.decrypt(hak, sealed.ciphertext, sealed.nonce, archiveEntryAad(C1, id(3)))
        expect(decodeArchiveEnvelope(new TextDecoder().decode(opened))?.app.body).toMatchObject({ text: "look" })
        await expect(laptop.sealer.decrypt(hak, sealed.ciphertext, sealed.nonce, archiveEntryAad(C2, id(3)))).rejects.toThrow()

        // The phone types the new words: the real restore, then the store's own actions.
        const phone = historyDevice(idp, "phone")
        await phone.deps.sessionPort.linkDevice(IDP, phone.token, phone.storage.deviceId)
        expect(await restoreHistoryFromPassphraseUseCase(phone.deps)({ idpUrl: IDP, accessToken: phone.token, actorUri: ACTOR, passphrase: words })).toEqual({
            kind: "kept",
            generation: 2,
        })
        useAppStore.setState({ user: { address: ME } as UserProfile, dmMessages: {}, appliedReactionIds: {} })
        const restore = new HistoryRestore({ e2ee: phone.e2ee, cacheReady: async () => undefined })
        expect(await restore.run({ idpUrl: IDP, accessToken: () => phone.token }, replayRestoredHistory)).toMatchObject({ kind: "restored", messages: 6, skipped: 0 })

        const shown = (m: CachedMessage | Message) => ({
            id: m.id,
            author: m.author,
            authorAddress: m.authorAddress,
            content: m.content,
            createdAt: m.createdAt,
            edited: m.edited,
            replyTo: m.replyTo,
            attachments: m.attachments ?? [],
            attachmentKeys: m.attachmentKeys,
            reactions: m.reactions,
        })
        const { dmMessages } = useAppStore.getState()
        for (const [conversationId, messages] of Object.entries(cache)) {
            const kept = messages.filter((m) => plan({ [conversationId]: [m] }).length > 0)
            expect(dmMessages[conversationId].map(shown)).toEqual(kept.map(shown))
        }
    })

    it("files a snapshot under an id only the words give: the same at every run, another under other words", async () => {
        const { idp, laptop } = await replaced()
        const cache = { [C1]: [message(4, { reactions: [{ emoji: "👍", count: 2, reacted: true }] })] }
        const snapshotId = () => [...idp.archive.keys()].find((key) => key !== id(4))!

        await rearchiving(laptop, cache).run(context(laptop))
        const first = snapshotId()
        expect(idp.archive.size).toBe(2)
        expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
        expect(first).not.toBe(editEntryId(sha256(new TextEncoder().encode(`${C1}\n${id(4)}\nreactions`))))

        laptop.storage.rearchiveDue = { generation: 2, cursor: null }
        await rearchiving(laptop, cache).run(context(laptop))
        expect(snapshotId()).toBe(first)

        await laptop.e2ee.dismissNewWords()
        laptop.token = accessToken(Date.now(), "laptop")
        await laptop.deps.sessionPort.linkDevice(IDP, laptop.token, laptop.storage.deviceId)
        await replace(laptop)
        await rearchiving(laptop, cache).run(context(laptop))
        expect(idp.key?.generation).toBe(3)
        expect(snapshotId()).not.toBe(first)
    })

    it("a resumed run after new reactions counts them once: the first snapshot the IdP took stays", async () => {
        const { idp, laptop } = await replaced()
        const cache = { [C1]: [message(4, { reactions: [{ emoji: "👍", count: 1, reacted: false }] }), message(5)] }
        const upload = vi.spyOn(idp, "uploadBatch")
        // Taken, its answer lost: the cursor doesn't move.
        upload.mockImplementationOnce(async (...args) => {
            await FakeHistoryIdp.prototype.uploadBatch.apply(idp, args)
            throw new IdpError(401, "invalid_token", "expired")
        })
        expect(await rearchiving(laptop, cache, { now: T0 + 3_600_000 }).run(context(laptop))).toMatchObject({ kind: "failed" })

        // Bob's 🔥 comes after the first snapshot's row, on the IdP's clock: the cache counts it, the flusher archives it.
        const fire = "2026-11-01T00:30:00.000Z"
        laptop.e2ee.startFlushing(IDP, () => laptop.token)
        laptop.e2ee.bufferForArchive(C1, id(950), archivedReaction({ address: BOB }, fire, { target_message_id: id(4), emoji: "🔥", op: "add" }))
        await laptop.e2ee["flushArchiveNow"]()
        laptop.e2ee.stopFlushing()
        cache[C1][0] = { ...cache[C1][0], reactions: [{ emoji: "👍", count: 1, reacted: false }, { emoji: "🔥", count: 1, reacted: false }] }

        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })
        expect(await rearchiving(laptop, cache, { now: T0 + 3_720_000 }).run(context(laptop))).toMatchObject({ kind: "rearchived" })

        const { entries } = await laptop.e2ee.restoreHistory(IDP, laptop.token)
        const store = await restoreInto(entries)
        expect(store.dmMessages[C1][0].reactions).toEqual([
            { emoji: "👍", count: 1, reacted: false },
            { emoji: "🔥", count: 1, reacted: false },
        ])
    })

    for (const [clock, skew] of [
        ["fast", 2 * 3_600_000],
        ["slow", -2 * 3_600_000],
    ] as const) {
        it(`with the sealing device's clock 2 hours ${clock}, neither under-counts nor double-counts`, async () => {
            const { idp, laptop } = await replaced()
            // The fake IdP dates its rows from 2026-11-01T00:00:00Z, one second a row.
            const server = Date.UTC(2026, 10, 1)
            const named = async (n: number, emoji: string, at: number) => {
                laptop.e2ee.startFlushing(IDP, () => laptop.token)
                laptop.e2ee.bufferForArchive(
                    C1,
                    id(950 + n),
                    archivedReaction({ address: BOB }, new Date(at).toISOString(), { target_message_id: id(4), emoji, op: "add" }),
                )
                await laptop.e2ee["flushArchiveNow"]()
                laptop.e2ee.stopFlushing()
            }
            // Bob's 👍 an hour before the snapshot, archived first; the snapshot counts it.
            await named(1, "👍", server - 3_600_000)
            const cache = { [C1]: [message(4, { reactions: [{ emoji: "👍", count: 1, reacted: false }] })] }
            await rearchiving(laptop, cache, { now: server + 2_000 + skew }).run(context(laptop))
            // Bob's 🔥 half an hour after it.
            await named(2, "🔥", server + 1_800_000)

            const { entries } = await laptop.e2ee.restoreHistory(IDP, laptop.token)
            const store = await restoreInto(entries)
            expect(store.dmMessages[C1][0].reactions).toEqual([
                { emoji: "👍", count: 1, reacted: false },
                { emoji: "🔥", count: 1, reacted: false },
            ])
            expect(idp.archive.size).toBe(4)
        })
    }

    it("an entry the instance moves to other ids doesn't restore", async () => {
        const { idp, laptop } = await replaced()
        await rearchiving(laptop, { [C1]: [message(1), message(2)] }).run(context(laptop))
        const moved = idp.archive.get(id(1))!
        idp.archive.set(id(1), { ...moved, conversation_id: C2 })

        const { entries, skipped } = await laptop.e2ee.restoreHistory(IDP, laptop.token)
        expect(skipped).toBe(1)
        expect(restoredMessages(entries).map((m) => m.id)).toEqual([id(2)])
    })

    it("cut short, keeps how far it got; at the next start it goes on from there, and the archive holds everything once", async () => {
        const { idp, laptop } = await replaced()
        const cache = { [C1]: many(120) }
        const upload = vi.spyOn(idp, "uploadBatch")
        upload.mockImplementationOnce((...args) => FakeHistoryIdp.prototype.uploadBatch.apply(idp, args))
        upload.mockRejectedValueOnce(new IdpError(401, "invalid_token", "The access token expired"))

        expect(await rearchiving(laptop, cache).run(context(laptop))).toMatchObject({ kind: "failed", generation: 2 })
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: rearchiveBatches(plan(cache))[0][49].position })
        expect(idp.archive.size).toBe(50)

        // A reload: the same storage, a new engine and run.
        upload.mockClear()
        const reloaded = historyDevice(idp, "laptop", laptop.storage)
        reloaded.token = laptop.token
        await reloaded.e2ee.checkHistoryKey(IDP, reloaded.token)
        const states: HistoryRearchiveState[] = []
        const again = rearchiving(reloaded, cache)
        again.onChange(() => states.push(again.state))
        expect(await again.run(context(reloaded))).toEqual({ kind: "rearchived", generation: 2, messages: 120, skipped: 0 })

        expect(upload.mock.calls.map((call) => (call[3] as unknown[]).length)).toEqual([50, 20])
        expect(states[0]).toEqual({ kind: "rearchiving", generation: 2, done: 50, total: 120 })
        expect(idp.archive.size).toBe(120)
        expect(laptop.storage.rearchiveDue).toBeNull()
    })

    it("runs once a page load: two calls are one run, and a later one none, even left due", async () => {
        const { idp, laptop } = await replaced()
        const upload = vi.spyOn(idp, "uploadBatch").mockRejectedValueOnce(new IdpError(401, "invalid_token", "expired"))
        const running = rearchiving(laptop, { [C1]: many(3) })

        const [a, b] = await Promise.all([running.run(context(laptop)), running.run(context(laptop))])
        expect(a).toBe(b)
        expect(a).toMatchObject({ kind: "failed" })
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })
        await running.run(context(laptop))
        expect(upload).toHaveBeenCalledTimes(1)
    })

    it("tries nothing before the cache was read back, and marks nothing tried", async () => {
        const { idp, laptop } = await replaced()
        let cache: Record<string, CachedMessage[]> | null = null
        const running = new HistoryRearchive({
            e2ee: laptop.e2ee,
            localHistory: async () => cache && { me: ME, conversations: cache },
            sleep: async () => undefined,
        })

        expect(await running.run(context(laptop))).toEqual({ kind: "idle" })
        cache = { [C1]: many(3) }
        expect(await running.run(context(laptop))).toMatchObject({ kind: "rearchived", messages: 3 })
        expect(idp.archive.size).toBe(3)
    })

    it("is dropped once another generation is in force — another replacement, a start over —, the row with it", async () => {
        const { idp, laptop } = await replaced()
        const rival = historyDevice(idp, "rival")
        await idp.session().linkDevice(IDP, rival.token, rival.storage.deviceId)
        const upload = vi.spyOn(idp, "uploadBatch")
        upload.mockImplementationOnce(async (...args) => {
            const inserted = await FakeHistoryIdp.prototype.uploadBatch.apply(idp, args)
            await idp.setKey(IDP, rival.token, (await rival.e2ee.mintHistoryKey(3)).key)
            return inserted
        })

        expect(await rearchiving(laptop, { [C1]: many(80) }).run(context(laptop))).toEqual({ kind: "abandoned", generation: 2 })
        expect(laptop.storage.rearchiveDue).toBeNull()
        expect(upload).toHaveBeenCalledTimes(2)
        expect(await laptop.e2ee.historyKeyStanding()).toMatchObject({ kind: "mismatch", generation: 3, held: 2 })
    })

    it("on stale_history_key reads the key again: still held, the same sealed batch goes again", async () => {
        const { idp, laptop } = await replaced()
        const upload = vi.spyOn(idp, "uploadBatch").mockRejectedValueOnce(new IdpError(409, "stale_history_key", "stale"))
        const encrypt = vi.spyOn(laptop.sealer, "encrypt")
        const read = vi.spyOn(idp, "getKey")

        expect(await rearchiving(laptop, { [C1]: many(3) }).run(context(laptop))).toMatchObject({ kind: "rearchived", messages: 3 })
        expect(read).toHaveBeenCalledOnce()
        expect(upload).toHaveBeenCalledTimes(2)
        expect(encrypt).toHaveBeenCalledTimes(3)
        expect(upload.mock.calls[1][3]).toBe(upload.mock.calls[0][3])
    })

    it("on stale_history_key, stops when this device no longer holds the generation, keeping how far it got", async () => {
        const { idp, laptop } = await replaced()
        const upload = vi.spyOn(idp, "uploadBatch")
        upload.mockImplementationOnce((...args) => FakeHistoryIdp.prototype.uploadBatch.apply(idp, args))
        upload.mockImplementationOnce(async () => {
            idp.key = { ...idp.key!, checkValue: new Uint8Array(32).fill(7) }
            throw new IdpError(409, "stale_history_key", "stale")
        })

        expect(await rearchiving(laptop, { [C1]: many(60) }).run(context(laptop))).toMatchObject({ kind: "failed", generation: 2 })
        expect(laptop.storage.rearchiveDue?.cursor?.messageId).toBe(id(149))
        expect(await laptop.e2ee.historyKeyStanding()).toMatchObject({ kind: "mismatch", reason: "check-value", generation: 2 })
    })

    it("backs off on 429 and 5xx, a batch at a time, the page given back between batches", async () => {
        const { idp, laptop } = await replaced()
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        const upload = vi.spyOn(idp, "uploadBatch")
        upload.mockRejectedValueOnce(new IdpError(429, "too_many_requests", "slow down"))
        upload.mockRejectedValueOnce(new IdpError(503, "unavailable", "unavailable"))
        const wait = async (ms: number) => {
            await vi.advanceTimersByTimeAsync(ms)
            await flush()
        }

        const running = rearchiving(laptop, { [C1]: many(51) }, { paced: true }).run(context(laptop))
        await flush()
        expect(upload).toHaveBeenCalledTimes(1)
        await wait(REARCHIVE_RETRY_DELAYS_MS[0] - 1)
        expect(upload).toHaveBeenCalledTimes(1)
        await wait(1)
        expect(upload).toHaveBeenCalledTimes(2)
        await wait(REARCHIVE_RETRY_DELAYS_MS[1] - 1)
        expect(upload).toHaveBeenCalledTimes(2)
        await wait(1)
        expect(upload).toHaveBeenCalledTimes(3)
        // Taken: the next batch waits its pace.
        await wait(REARCHIVE_PACE_MS - 1)
        expect(upload).toHaveBeenCalledTimes(3)
        await wait(1)
        expect(upload).toHaveBeenCalledTimes(4)

        expect(await settle(running)).toMatchObject({ kind: "rearchived", messages: 51 })
    })

    it("past its last try with no answer, stops — and is left untried, so a later call (a reconnect) tries again", async () => {
        const { idp, laptop } = await replaced()
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
        const upload = vi.spyOn(idp, "uploadBatch").mockRejectedValue(new TypeError("Failed to fetch"))
        const running = rearchiving(laptop, { [C1]: many(3) }, { paced: true })

        expect(await settle(running.run(context(laptop)))).toMatchObject({ kind: "failed", generation: 2 })
        expect(upload).toHaveBeenCalledTimes(REARCHIVE_RETRY_DELAYS_MS.length + 1)
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })

        upload.mockRestore()
        expect(await settle(running.run(context(laptop)))).toMatchObject({ kind: "rearchived", messages: 3 })
    })

    it("skips a batch refused for good, saying how many messages it held, and goes on", async () => {
        const { idp, laptop } = await replaced()
        vi.spyOn(idp, "uploadBatch").mockRejectedValueOnce(new IdpError(403, "access_denied", "not a member"))

        expect(await rearchiving(laptop, { [C1]: many(2), [C2]: many(3, 300) }).run(context(laptop))).toEqual({
            kind: "rearchived",
            generation: 2,
            messages: 3,
            skipped: 2,
        })
        expect(idp.archive.size).toBe(3)
    })

    it("seals each entry once a run, the archive flusher's copy waiting included, sent once", async () => {
        const { idp, laptop } = await replaced()
        const cache = { [C1]: conversation() }
        const [first] = plan(cache)
        laptop.e2ee.bufferForArchive(C1, id(1), first.envelope)
        const upload = vi.spyOn(idp, "uploadBatch").mockRejectedValueOnce(new IdpError(429, "too_many_requests", "slow down"))
        const encrypt = vi.spyOn(laptop.sealer, "encrypt")

        await rearchiving(laptop, cache).run(context(laptop))
        laptop.e2ee.startFlushing(IDP, () => laptop.token)
        await laptop.e2ee["flushArchiveNow"]()
        laptop.e2ee.bufferForArchive(C1, id(1), first.envelope)
        await laptop.e2ee["flushArchiveNow"]()
        laptop.e2ee.stopFlushing()

        expect(encrypt).toHaveBeenCalledTimes(plan(cache).length)
        expect(upload.mock.calls[1][3]).toBe(upload.mock.calls[0][3])
        const sent = idp.uploads.flatMap((u) => u.ids)
        expect(sent.filter((sentId) => sentId === id(1))).toHaveLength(1)
        expect(new Set(sent).size).toBe(sent.length)
    })

    it("waits, untried, while this device doesn't hold the generation due yet", async () => {
        const { idp, laptop } = await replaced()
        laptop.storage.rearchiveDue = { generation: 3, cursor: null }
        const upload = vi.spyOn(idp, "uploadBatch")

        expect(await rearchiving(laptop, { [C1]: many(3) }).run(context(laptop))).toEqual({ kind: "idle" })
        expect(upload).not.toHaveBeenCalled()
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 3, cursor: null })
    })

    it("signed out mid-way, stops where it got, never failed, and goes on once signed in again", async () => {
        const { idp, laptop } = await replaced()
        let token: string | null = laptop.token
        vi.spyOn(idp, "uploadBatch").mockImplementationOnce(async (...args) => {
            token = null
            return FakeHistoryIdp.prototype.uploadBatch.apply(idp, args)
        })
        const running = rearchiving(laptop, { [C1]: many(60) })

        expect(await running.run({ idpUrl: IDP, accessToken: () => token })).toEqual({ kind: "signed-out", generation: 2 })
        expect(laptop.storage.rearchiveDue?.cursor?.messageId).toBe(id(149))

        token = laptop.token
        expect(await running.run({ idpUrl: IDP, accessToken: () => token })).toMatchObject({ kind: "rearchived", messages: 60 })
    })

    it("one tab at a time under the account's lock: every entry sent once, the cursor never going back", async () => {
        const { idp, laptop } = await replaced()
        const other = historyDevice(idp, "laptop", laptop.storage)
        other.token = laptop.token
        await other.e2ee.checkHistoryKey(IDP, other.token)
        const cache = { [C1]: many(120) }
        const lock = sharedLock()
        const cursors: string[] = []
        for (const tab of [laptop, other]) {
            const advance = tab.e2ee.advanceHistoryRearchive.bind(tab.e2ee)
            vi.spyOn(tab.e2ee, "advanceHistoryRearchive").mockImplementation(async (generation, cursor) => {
                cursors.push(cursor.messageId)
                return advance(generation, cursor)
            })
        }

        const [a, b] = await Promise.all([
            rearchiving(laptop, cache, { lock }).run(context(laptop)),
            rearchiving(other, cache, { lock }).run(context(other)),
        ])

        expect(a).toMatchObject({ kind: "rearchived", messages: 120 })
        expect(b).toEqual({ kind: "idle" })
        const sent = idp.uploads.flatMap((u) => u.ids)
        expect(sent).toHaveLength(120)
        expect(new Set(sent).size).toBe(120)
        expect(cursors).toEqual([...cursors].sort())
    })
})
