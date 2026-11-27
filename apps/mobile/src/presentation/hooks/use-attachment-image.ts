import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { useEffect, useState } from "react"
import { attachmentImages } from "@/presentation/_libs/attachment-images"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAppStore } from "@/store/store"

/**
 * An encrypted image as a `data:` URI: `null` while it loads, or without the key its message carried; `failed` once it
 * couldn't be opened. One opened already is there from the first render.
 */
export function useAttachmentImage(attachmentKey: AttachmentBlobKey | undefined): { uri: string | null; failed: boolean } {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const [loaded, setLoaded] = useState<{ id: string; uri: string } | null>(null)
    const [failedId, setFailedId] = useState<string | null>(null)
    const id = attachmentKey?.id
    const uri = !id ? null : loaded?.id === id ? loaded.uri : attachmentImages.url(id)

    useEffect(() => {
        if (!attachmentKey || !signedIn) return
        const release = attachmentImages.hold(attachmentKey.id)
        let live = true
        if (attachmentImages.url(attachmentKey.id) === null) {
            attachmentImages.load(attachmentKey).then(
                (uri) => {
                    if (live) setLoaded({ id: attachmentKey.id, uri })
                },
                (error: unknown) => {
                    warnE2ee(`opening the attachment ${attachmentKey.id}`, error)
                    if (live) setFailedId(attachmentKey.id)
                }
            )
        }
        return () => {
            live = false
            release()
        }
    }, [attachmentKey, signedIn])

    return { uri, failed: uri === null && id !== undefined && failedId === id }
}
