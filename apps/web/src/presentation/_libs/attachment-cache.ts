import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { openAttachmentUseCase } from "@pinai/domain/usecases/dm/open-attachment.usecase"
import { getAttachmentCryptoPort, getDmPort } from "@/ioc"
import { useAppStore } from "@/store/store"

const BUDGET_BYTES = 150 * 1024 * 1024

interface ObjectUrls {
    create(bytes: Uint8Array, type: string): string
    revoke(url: string): void
}

const browserUrls: ObjectUrls = {
    create: (bytes, type) => URL.createObjectURL(new Blob([bytes as BlobPart], { type })),
    revoke: (url) => URL.revokeObjectURL(url),
}

/**
 * The attachments the page opened, decrypted, as object URLs by attachment id: a conversation
 * opened again, or a row scrolled back into view, shows its images at once. Past the budget the
 * least recently used go, never one held on screen.
 */
export class AttachmentCache {
    // In order of use, the most recent last.
    readonly #opened = new Map<string, { url: string; bytes: number }>()
    readonly #opening = new Map<string, Promise<string>>()
    readonly #holders = new Map<string, number>()
    readonly #open: (key: AttachmentBlobKey) => Promise<Uint8Array>
    readonly #budget: number
    readonly #urls: ObjectUrls
    #bytes = 0
    #generation = 0

    constructor(open: (key: AttachmentBlobKey) => Promise<Uint8Array>, budget: number, urls: ObjectUrls = browserUrls) {
        this.#open = open
        this.#budget = budget
        this.#urls = urls
    }

    /** The attachment's object URL, when it is opened already. */
    url(id: string): string | null {
        return this.#opened.get(id)?.url ?? null
    }

    /** Its object URL, the attachment downloaded and decrypted once however many ask. */
    load(key: AttachmentBlobKey): Promise<string> {
        const done = this.#opened.get(key.id)
        if (done) return Promise.resolve(done.url)
        const pending = this.#opening.get(key.id)
        if (pending) return pending
        const generation = this.#generation
        const run = this.#open(key)
            .then((plaintext) => {
                if (generation !== this.#generation) throw new Error("The account changed meanwhile")
                const url = this.#urls.create(plaintext, key.mime_type)
                this.#opened.set(key.id, { url, bytes: plaintext.byteLength })
                this.#bytes += plaintext.byteLength
                this.#trim()
                return url
            })
            .finally(() => {
                if (this.#opening.get(key.id) === run) this.#opening.delete(key.id)
            })
        this.#opening.set(key.id, run)
        return run
    }

    /** Keeps the attachment until the answer is called, and makes it the most recently used. */
    hold(id: string): () => void {
        this.#holders.set(id, (this.#holders.get(id) ?? 0) + 1)
        const entry = this.#opened.get(id)
        if (entry) {
            this.#opened.delete(id)
            this.#opened.set(id, entry)
        }
        let held = true
        return () => {
            if (!held) return
            held = false
            const left = (this.#holders.get(id) ?? 1) - 1
            if (left > 0) this.#holders.set(id, left)
            else this.#holders.delete(id)
            this.#trim()
        }
    }

    /** Starts loading these before anything shows them; a failure is left to the row that will. */
    prefetch(keys: Iterable<AttachmentBlobKey>): void {
        for (const key of keys) if (!this.#opened.has(key.id)) this.load(key).catch(() => {})
    }

    /** Lets go of everything, a load under way included. */
    clear(): void {
        this.#generation++
        for (const { url } of this.#opened.values()) this.#urls.revoke(url)
        this.#opened.clear()
        this.#opening.clear()
        this.#bytes = 0
    }

    #trim(): void {
        for (const [id, entry] of this.#opened) {
            if (this.#bytes <= this.#budget) return
            if (this.#holders.has(id)) continue
            this.#urls.revoke(entry.url)
            this.#opened.delete(id)
            this.#bytes -= entry.bytes
        }
    }
}

export const attachmentCache = new AttachmentCache((key) => {
    const { idpUrl, accessToken } = useAppStore.getState()
    if (!idpUrl || !accessToken) return Promise.reject(new Error("Not signed in"))
    return openAttachmentUseCase({ idpUrl, accessToken }, key, {
        dm: getDmPort(),
        attachmentCrypto: getAttachmentCryptoPort(),
    })
}, BUDGET_BYTES)

// Another account's plaintext is never shown, nor kept in memory past its sign-out.
let account = useAppStore.getState().user?.actor_uri ?? null
useAppStore.subscribe((state) => {
    const now = state.user?.actor_uri ?? null
    if (now === account) return
    account = now
    attachmentCache.clear()
})
