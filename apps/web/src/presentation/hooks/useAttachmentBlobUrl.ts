import { useEffect, useState } from "react"

import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { attachmentCache } from "@/presentation/_libs/attachment-cache"
import { useAppStore } from "@/store/store"

/**
 * The object URL of an encrypted attachment: `null` while it loads, or without the key its
 * message carried (one this device couldn't decrypt); `failed` once it couldn't be opened. One
 * the page opened already is there from the first render.
 */
export function useAttachmentBlobUrl(attachmentKey: AttachmentBlobKey | undefined): { url: string | null; failed: boolean } {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null)
    const [failedId, setFailedId] = useState<string | null>(null)
    const id = attachmentKey?.id
    const url = !id ? null : loaded?.id === id ? loaded.url : attachmentCache.url(id)

    useEffect(() => {
        if (!attachmentKey || !signedIn) return
        const release = attachmentCache.hold(attachmentKey.id)
        let live = true
        if (attachmentCache.url(attachmentKey.id) === null) {
            attachmentCache.load(attachmentKey).then(
                (url) => {
                    if (live) setLoaded({ id: attachmentKey.id, url })
                },
                (e: unknown) => {
                    // eslint-disable-next-line no-console
                    console.warn(`Attachment ${attachmentKey.id} could not be opened:`, e)
                    if (live) setFailedId(attachmentKey.id)
                },
            )
        }
        return () => {
            live = false
            release()
        }
    }, [attachmentKey, signedIn])

    return { url, failed: url === null && id !== undefined && failedId === id }
}
