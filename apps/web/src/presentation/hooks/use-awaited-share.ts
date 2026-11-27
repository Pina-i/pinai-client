import { useCallback, useEffect, useRef, useState } from "react"

import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { ShareWait } from "@pinai/domain/usecases/e2ee/share-wait.usecase"
import { acceptWaitingShare } from "@/presentation/_libs/accept-share"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { documentVisibility } from "@/presentation/_libs/document-visibility"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"

export interface AwaitedShareView {
    /** The wait's state; `null` before the screen first listened. */
    share: AwaitedShareState | null
    /** The device was just approved here: the share is likelier now, the backoff starts over. */
    again: () => void
}

/**
 * The domain's `ShareWait` on a screen of a device without the words, while `listening` — the restore pages and
 * the app's banner —, through the page's one accept (`acceptWaitingShare`).
 */
export function useAwaitedShare(listening: boolean, onKept: () => void): AwaitedShareView {
    const [share, setShare] = useState<AwaitedShareState | null>(null)
    const waiting = useRef<ShareWait | null>(null)
    const kept = useRef(onKept)
    useEffect(() => {
        kept.current = onKept
    })

    useEffect(() => {
        if (!listening) return
        const wait = new ShareWait({
            accept: acceptWaitingShare,
            visibility: documentVisibility,
            signInAgainOnDeviceMismatch,
            warn: warnE2ee,
            onState: setShare,
            onKept: () => kept.current(),
        })
        waiting.current = wait
        wait.start()
        return () => {
            wait.stop()
            if (waiting.current === wait) waiting.current = null
        }
    }, [listening])

    const again = useCallback(() => waiting.current?.again(), [])
    return { share, again }
}
