import { useCallback, useEffect, useState } from "react"
import { useAppStore } from "@/store/store"
import { isModShortcut } from "@/presentation/_libs/shortcut-key"

/**
 * ⌘K (Ctrl+K off Apple devices) goes to the DM sidebar's search field. The request waits in
 * `focusPending` until the field takes it: from a server, the sidebar first switches to the DMs.
 */
export function useConversationSearchShortcut() {
    const [focusPending, setFocusPending] = useState(false)
    const switchToDms = useAppStore((s) => s.switchToDms)

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (!isModShortcut(e, "k")) return
            // An open dialog keeps the keyboard.
            if (document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')) return
            e.preventDefault()
            if (useAppStore.getState().view !== "dms") switchToDms()
            setFocusPending(true)
        }
        document.addEventListener("keydown", onKeyDown)
        return () => document.removeEventListener("keydown", onKeyDown)
    }, [switchToDms])

    const searchFocused = useCallback(() => setFocusPending(false), [])

    return { focusPending, searchFocused }
}
