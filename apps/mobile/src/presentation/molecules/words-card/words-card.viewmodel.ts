import { setStringAsync } from "expo-clipboard"
import { usePreventScreenCapture } from "expo-screen-capture"
import { useEffect, useId, useRef, useState } from "react"
import { AppState } from "react-native"

const COPIED_MS = 2400

/**
 * The words hidden until shown; hidden again when the app leaves the front. Copied as sensitive, so Android's preview
 * and the keyboards' clipboard leave them out. While the card is up, screenshots and the app switcher's preview are
 * blocked (Android's FLAG_SECURE).
 */
export function useWordsCard(words: string[], onSeen?: () => void) {
    // A key per card: one card leaving mustn't allow capture while another, under it in the stack, is still up.
    usePreventScreenCapture(useId())
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
            void setStringAsync(words.join(" "), { android: { isSensitive: true } })
            onSeen?.()
            setCopied(true)
            clearTimeout(copiedTimer.current)
            copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
        },
    }
}
