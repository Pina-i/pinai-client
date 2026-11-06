import { useCallback, useEffect, useRef, useState } from "react"

import { AwaitedShare, type AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { acceptWaitingShare } from "@/presentation/_libs/accept-share"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"

export interface AwaitedShareView {
    /** The wait's state; `null` before the screen first listened. */
    share: AwaitedShareState | null
    /** The device was just approved here: the share is likelier now, the backoff starts over. */
    again: () => void
}

/**
 * A screen of a device without the words reading its key share while `listening` — the restore
 * pages and the app's banner — through the page's one accept (`acceptWaitingShare`), on the entry's
 * backoff, none while the page is hidden. `onKept` once the words are held; `device_mismatch`
 * signs in again.
 */
export function useAwaitedShare(listening: boolean, onKept: () => void): AwaitedShareView {
    const [share, setShare] = useState<AwaitedShareState | null>(null)
    const awaitedRef = useRef<AwaitedShare | null>(null)
    const kept = useRef(onKept)
    useEffect(() => {
        kept.current = onKept
    })

    useEffect(() => {
        if (!listening) return
        const awaited = new AwaitedShare(acceptWaitingShare, warnE2ee)
        awaitedRef.current = awaited
        let live = true
        let timer: ReturnType<typeof setTimeout> | undefined
        const unsubscribe = awaited.onChange(() => {
            const settled = awaited.state
            setShare(settled)
            if (settled.kind === "kept") kept.current()
            if (settled.kind === "ended") {
                void signInAgainOnDeviceMismatch(settled.error).then((signingIn) => {
                    if (!signingIn) warnE2ee("reading the history key share", settled.error)
                })
            }
        })
        const tick = () => {
            clearTimeout(timer)
            if (!live || document.hidden) return
            void awaited.tick().then(() => {
                if (live && awaited.state.kind === "waiting") timer = setTimeout(tick, awaited.nextDelay())
            })
        }
        const onVisible = () => {
            if (!document.hidden) tick()
        }
        document.addEventListener("visibilitychange", onVisible)
        tick()
        return () => {
            live = false
            clearTimeout(timer)
            unsubscribe()
            document.removeEventListener("visibilitychange", onVisible)
            if (awaitedRef.current === awaited) awaitedRef.current = null
        }
    }, [listening])

    const again = useCallback(() => void awaitedRef.current?.again(), [])
    return { share, again }
}
