import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import type { AttachmentBlobKey } from "@/domain/models/e2ee"
import { getAttachmentCryptoPort, getDmPort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * Resolve a Blob URL for an encrypted attachment.
 *
 * Three-step pipeline (Phase 5c.4):
 * 1. Resolve the IdP-token-protected ciphertext URL via
 *    `GET /api/attachments/:id`. Cached for 50 minutes
 *    (the IdP issues 1h tokens).
 * 2. Fetch the ciphertext bytes through that URL — the IdP
 *    streams them through (browser never touches the private object
 *    store directly).
 * 3. Decrypt locally with the per-attachment AES-GCM key + nonce
 *    pulled from the decrypted MLS application body.
 *
 * Returns `null` while any step is in flight or on failure. Callers
 * render a placeholder (filename text, spinner) while waiting.
 *
 * The decrypted Blob URL is created via `URL.createObjectURL` and
 * revoked on unmount + on key change to avoid memory leaks.
 *
 * `attachmentKey` is `null` / `undefined` when the MLS body hasn't
 * been decrypted yet (e.g. peer message we couldn't decode). The
 * hook short-circuits to `null` in that case.
 */
export function useAttachmentBlobUrl(
    attachmentId: string | undefined,
    attachmentKey: AttachmentBlobKey | undefined,
): string | null {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const enabled = !!attachmentId && !!attachmentKey && !!accessToken && !!idpUrl

    // Step 1: resolve the token-protected ciphertext URL.
    const { data: ciphertextUrl } = useQuery({
        queryKey: ["attachment-blob-url", idpUrl ?? "", attachmentId ?? ""],
        queryFn: () => getDmPort().getAttachmentBlobUrl(idpUrl!, accessToken!, attachmentId!),
        enabled,
        staleTime: 50 * 60 * 1000,
    })

    // Step 2 + 3: fetch + decrypt + objectURL.
    //
    // The object URL is stored tagged with the inputs that produced it, and
    // read back only on a match. That makes "the attachment changed, drop the
    // old URL" a derivation rather than a reset effect — no cascading render,
    // and no window in which the previous attachment's image is still being
    // handed out.
    const decryptKey = enabled && ciphertextUrl && attachmentKey ? `${attachmentId}|${ciphertextUrl}` : null
    const [decrypted, setDecrypted] = useState<{ key: string; url: string } | null>(null)
    const decryptedUrl = decryptKey !== null && decrypted?.key === decryptKey ? decrypted.url : null

    useEffect(() => {
        if (decryptKey === null || !ciphertextUrl || !attachmentKey) return
        let cancelled = false
        let createdUrl: string | null = null
        ;(async () => {
            try {
                const resp = await fetch(ciphertextUrl)
                if (!resp.ok) throw new Error(`Ciphertext fetch failed: ${resp.status}`)
                const ciphertext = new Uint8Array(await resp.arrayBuffer())
                const plaintext = await getAttachmentCryptoPort().decryptDownloaded(ciphertext, attachmentKey)
                const blob = new Blob([plaintext as BlobPart], { type: attachmentKey.mime_type })
                if (cancelled) return
                createdUrl = URL.createObjectURL(blob)
                setDecrypted({ key: decryptKey, url: createdUrl })
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn(`Attachment ${attachmentId} decrypt failed:`, e)
                if (!cancelled) setDecrypted(null)
            }
        })()
        return () => {
            cancelled = true
            if (createdUrl) URL.revokeObjectURL(createdUrl)
        }
    }, [decryptKey, ciphertextUrl, attachmentKey, attachmentId])

    return decryptedUrl
}
