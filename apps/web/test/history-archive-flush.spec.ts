import { afterEach, describe, expect, it, vi } from "vitest"

import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { archivedText } from "@pinai/domain/models/history-archive"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { ArchiveEntry } from "@pinai/domain/ports/history-archive.port"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"

import { ACTOR, FakeHistoryIdp, IDP, historyDevice } from "./setup/history-idp"

const ALICE = { address: "alice@idp.test", displayName: "Alice" }
const C1 = "11112222-3333-4444-5555-666677778888"
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

type Device = ReturnType<typeof historyDevice>

/** The account's first device, holding generation 1 and flushing. */
async function engine() {
    const idp = new FakeHistoryIdp()
    const device = historyDevice(idp, "laptop")
    await bootstrapFirstDeviceUseCase(device.deps)({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR })
    device.e2ee.startFlushing(IDP, () => device.token)
    running.push(device)
    const uploadBatch = vi.spyOn(idp, "uploadBatch")
    return { idp, device, e2ee: device.e2ee, uploadBatch }
}

function queue(device: Device, from: number, to: number) {
    for (let i = from; i < to; i++) {
        device.e2ee.bufferForArchive(C1, id(i), archivedText(ALICE, "2026-11-01T10:00:00Z", { text: `${i}` }, undefined))
    }
}

const uploadedIds = (call: unknown[]) => (call[3] as ArchiveEntry[]).map((e) => e.id)

const running: Device[] = []
afterEach(() => {
    for (const device of running.splice(0)) device.e2ee.stopFlushing()
    vi.restoreAllMocks()
})

describe("the history archive queue", () => {
    it("uploads a long queue in batches the IdP takes", async () => {
        const { device, uploadBatch } = await engine()
        queue(device, 0, 60)
        await vi.waitFor(() => expect(uploadBatch).toHaveBeenCalledTimes(2))
        expect(uploadedIds(uploadBatch.mock.calls[0])).toHaveLength(50)
        expect(uploadedIds(uploadBatch.mock.calls[1])).toHaveLength(10)
    })

    it("drops a batch the IdP refuses and goes on with the next", async () => {
        const { device, uploadBatch } = await engine()
        uploadBatch.mockRejectedValueOnce(new IdpError(403, "forbidden", "not a member"))
        queue(device, 0, 60)
        await vi.waitFor(() => expect(uploadBatch).toHaveBeenCalledTimes(2))
        expect(uploadedIds(uploadBatch.mock.calls[1])).toEqual(Array.from({ length: 10 }, (_, i) => id(50 + i)))
    })

    it("keeps a batch that failed in transit for the next flush", async () => {
        const { device, uploadBatch } = await engine()
        uploadBatch.mockRejectedValueOnce(new Error("network"))
        queue(device, 0, 10)
        await vi.waitFor(() => expect(uploadBatch).toHaveBeenCalledTimes(1))
        queue(device, 10, 11)
        await vi.waitFor(() => expect(uploadBatch).toHaveBeenCalledTimes(2))
        expect(uploadedIds(uploadBatch.mock.calls[1])).toHaveLength(11)
    })

    it("queues an id once", async () => {
        const { device, uploadBatch } = await engine()
        queue(device, 0, 5)
        queue(device, 0, 10)
        await vi.waitFor(() => expect(uploadBatch).toHaveBeenCalledTimes(1))
        expect(uploadedIds(uploadBatch.mock.calls[0])).toHaveLength(10)
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
        const { idp, device } = await engine()
        device.e2ee.bufferForArchive(
            C1,
            id(1),
            archivedText(ALICE, "2026-11-01T10:00:00Z", { text: "look", attachments: [key] }, [listed]),
        )
        queue(device, 2, 11)
        await vi.waitFor(() => expect(idp.archive.size).toBe(10))

        const { entries, skipped } = await device.e2ee.restoreHistory(IDP, device.token)
        expect(skipped).toBe(0)
        const restored = entries.find((e) => e.id === id(1))
        const body = restored?.envelope.app.body as { attachments: AttachmentBlobKey[] }
        expect(body.attachments[0].key).toEqual(key.key)
        expect(restored?.envelope.attachments).toEqual([listed])
    })
})
