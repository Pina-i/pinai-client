import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { ShareWait } from "@pinai/domain/usecases/e2ee/share-wait.usecase"
import { useCallback, useEffect, useRef, useState } from "react"
import { acceptWaitingShare } from "@/presentation/_libs/accept-share"
import { appVisibility } from "@/presentation/_libs/app-visibility"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"

/** The domain's `ShareWait` while `listening`: a device without the words reading its key share, none in the background. */
export function useAwaitedShare(listening: boolean, onKept: () => void) {
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
            visibility: appVisibility,
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

    // The device was just approved here: the share is likelier now, the backoff starts over.
    const again = useCallback(() => waiting.current?.again(), [])
    return { share, again }
}
