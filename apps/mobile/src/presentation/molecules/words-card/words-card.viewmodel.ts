import { usePreventScreenCapture } from "expo-screen-capture"
import { useEffect, useId, useState } from "react"
import { AppState } from "react-native"

/**
 * The words hidden until held or kept visible; hidden again when the app leaves the front. While the card is up,
 * screenshots and the app switcher's preview are blocked (Android's FLAG_SECURE).
 */
export function useWordsCard() {
    // A key per card: one card leaving mustn't allow capture while another, under it in the stack, is still up.
    usePreventScreenCapture(useId())
    const [held, setHeld] = useState(false)
    const [keepVisible, setKeepVisible] = useState(false)

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state !== "active") {
                setHeld(false)
                setKeepVisible(false)
            }
        })
        return () => subscription.remove()
    }, [])

    return {
        shown: held || keepVisible,
        held,
        hold: () => setHeld(true),
        release: () => setHeld(false),
        keepVisible,
        setKeepVisible,
    }
}
