import { setStringAsync } from "expo-clipboard"
import { useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { useWordsPrivacy } from "@/presentation/_libs/words-privacy"

const COPIED_MS = 2400
/** How long iOS keeps the copied words on the clipboard. */
const CLIPBOARD_KEPT_MS = 5 * 60 * 1000

/**
 * The words hidden until shown; hidden again when the app leaves the front. Copied as sensitive on Android, so its
 * preview and the keyboards' clipboard leave them out; on iOS kept off the other devices' Universal Clipboard and
 * cleared after a while. While the card is up, screenshots and the app switcher's preview are blocked.
 */
export function useWordsCard(words: string[], onSeen?: () => void) {
    useWordsPrivacy()
    const [shown, setShown] = useState(false)
    const [copied, setCopied] = useState(false)
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state !== "active") setShown(false)
        })
        return () => {
            subscription.remove()
            clearTimeout(copiedTimer.current)
        }
    }, [])

    return {
        shown,
        toggle: () => {
            if (!shown) onSeen?.()
            setShown(!shown)
        },
        copied,
        copy: () => {
            void setStringAsync(words.join(" "), {
                android: { isSensitive: true },
                ios: { localOnly: true, expiresAt: new Date(Date.now() + CLIPBOARD_KEPT_MS) },
            })
            onSeen?.()
            setCopied(true)
            clearTimeout(copiedTimer.current)
            copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
        },
    }
}
