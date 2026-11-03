import { afterEach, describe, expect, it, vi } from "vitest"

import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import type { HistoryArchiveAdapter } from "@pinai/crypto/history-archive.adapter"
import type { E2eeStorage } from "@pinai/crypto/sealed-storage"
import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { archivedText } from "@pinai/domain/models/history-archive"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { ArchiveEntry, IHistoryArchivePort } from "@pinai/domain/ports/history-archive.port"

const ALICE = { address: "alice@idp.test", displayName: "Alice" }

// Sealing is the identity: these specs are about the queue, not the cipher.
const sealer = {
    deriveKey: async () => new Uint8Array(32),
    encrypt: async (_key: Uint8Array, plaintext: Uint8Array) => ({ ciphertext: plaintext, nonce: new Uint8Array(12) }),
    decrypt: async (_key: Uint8Array, ciphertext: Uint8Array) => ciphertext,
} as unknown as HistoryArchiveAdapter

function engine(uploadBatch: IHistoryArchivePort["uploadBatch"], downloaded: ArchiveEntry[] = []) {
    const archive = {
        getSalt: async () => new Uint8Array(16),
        uploadBatch: vi.fn(uploadBatch),
        downloadPage: async () => ({
            entries: downloaded.map((e) => ({ ...e, created_at: "2026-11-01T10:00:00Z" })),
            next_cursor: null,
        }),
    } as unknown as IHistoryArchivePort & { uploadBatch: ReturnType<typeof vi.fn> }
    const storage = {
        loadRecoveryPassphrase: async () => ["word"],
        clearRecoveryPassphrase: async () => undefined,
    } as unknown as E2eeStorage
    const e2ee = new E2eeAdapter(
        {} as never,
        {} as never,
        storage,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        archive,
        sealer,
    )
    e2ee.startFlushing("https://idp.test", () => "token")
    return { e2ee, archive }
}

function queue(e2ee: E2eeAdapter, from: number, to: number) {
    for (let i = from; i < to; i++) {
        e2ee.bufferForArchive("c1", `m${i}`, archivedText(ALICE, "2026-11-01T10:00:00Z", { text: `${i}` }, undefined))
    }
}

const uploadedIds = (call: unknown[]) => (call[2] as ArchiveEntry[]).map((e) => e.id)

let running: E2eeAdapter | null = null
afterEach(() => {
    running?.stopFlushing()
    running = null
})

describe("the history archive queue", () => {
    it("uploads a long queue in batches the IdP takes", async () => {
        const { e2ee, archive } = engine(async (_u, _t, entries) => entries.length)
        running = e2ee
        queue(e2ee, 0, 60)
        await vi.waitFor(() => expect(archive.uploadBatch).toHaveBeenCalledTimes(2))
        expect(uploadedIds(archive.uploadBatch.mock.calls[0])).toHaveLength(50)
        expect(uploadedIds(archive.uploadBatch.mock.calls[1])).toHaveLength(10)
    })

    it("drops a batch the IdP refuses and goes on with the next", async () => {
        const { e2ee, archive } = engine(async (_u, _t, entries) => entries.length)
        running = e2ee
        archive.uploadBatch.mockRejectedValueOnce(new IdpError(403, "forbidden", "not a member"))
        queue(e2ee, 0, 60)
        await vi.waitFor(() => expect(archive.uploadBatch).toHaveBeenCalledTimes(2))
        expect(uploadedIds(archive.uploadBatch.mock.calls[1])).toEqual(
            Array.from({ length: 10 }, (_, i) => `m${50 + i}`),
        )
    })

    it("keeps a batch that failed in transit for the next flush", async () => {
        const { e2ee, archive } = engine(async (_u, _t, entries) => entries.length)
        running = e2ee
        archive.uploadBatch.mockRejectedValueOnce(new Error("network"))
        queue(e2ee, 0, 10)
        await vi.waitFor(() => expect(archive.uploadBatch).toHaveBeenCalledTimes(1))
        queue(e2ee, 10, 11)
        await vi.waitFor(() => expect(archive.uploadBatch).toHaveBeenCalledTimes(2))
        expect(uploadedIds(archive.uploadBatch.mock.calls[1])).toHaveLength(11)
    })

    it("queues an id once", async () => {
        const { e2ee, archive } = engine(async (_u, _t, entries) => entries.length)
        running = e2ee
        queue(e2ee, 0, 5)
        queue(e2ee, 0, 10)
        await vi.waitFor(() => expect(archive.uploadBatch).toHaveBeenCalledTimes(1))
        expect(uploadedIds(archive.uploadBatch.mock.calls[0])).toHaveLength(10)
    })

    it("restores what it archived, attachment keys included", async () => {
        const key: AttachmentBlobKey = {
            id: "att-1",
            key: new Uint8Array(32).fill(9),
            nonce: new Uint8Array(12).fill(4),
            original_filename: "cat.gif",
            mime_type: "image/gif",
            byte_size: 99,
        }
        const listed = { id: "att-1", mime_type: "application/octet-stream", byte_size: 115, original_filename: "encrypted" }
        const sent: ArchiveEntry[] = []
        const writer = engine(async (_u, _t, entries) => {
            sent.push(...entries)
            return entries.length
        })
        running = writer.e2ee
        writer.e2ee.bufferForArchive(
            "c1",
            "m1",
            archivedText(ALICE, "2026-11-01T10:00:00Z", { text: "look", attachments: [key] }, [listed]),
        )
        queue(writer.e2ee, 2, 11)
        await vi.waitFor(() => expect(sent).toHaveLength(10))

        const reader = engine(async () => 0, sent)
        const { entries, skipped } = await reader.e2ee.restoreHistoryFromPassphrase("https://idp.test", "token", ["word"])
        reader.e2ee.stopFlushing()
        expect(skipped).toBe(0)
        const restored = entries.find((e) => e.id === "m1")
        const body = restored?.envelope.app.body as { attachments: AttachmentBlobKey[] }
        expect(body.attachments[0].key).toEqual(key.key)
        expect(restored?.envelope.attachments).toEqual([listed])
    })
})
