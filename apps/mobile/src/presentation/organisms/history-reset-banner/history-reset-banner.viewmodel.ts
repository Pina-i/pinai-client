import { router } from "expo-router"
import { useState } from "react"
import { useHistoryReset } from "@/presentation/_libs/history-reset"

const BARS = {
    "reset-by-unapproved":
        "Your history was reset from a device this one doesn't know. Nothing is saved to your backup from here until this is settled.",
    "unknown-change":
        "Your instance changed your history key in a way none of your devices made. Nothing is saved to your backup until it puts it back.",
} as const

const CHECKED = {
    checked: "Nothing has changed yet: your instance hasn't put your history key back.",
    offline: "Couldn't reach your instance. Try again in a moment.",
    failed: "Couldn't reach your instance. Try again in a moment.",
} as const

export type ResetWay = "it-was-me" | "it-wasnt-me" | "start-over"

/** The gate let this device in by its kept words over a reset it didn't make: what happened, and its ways. */
export function useHistoryResetBanner() {
    const { reset, recheck } = useHistoryReset()
    const [checking, setChecking] = useState(false)
    const [found, setFound] = useState<string | null>(null)
    const open = (way: ResetWay) => router.push({ pathname: "/history-reset", params: { way } })

    return {
        cause: reset?.cause ?? null,
        text: reset ? BARS[reset.cause] : null,
        checking,
        found,
        checkAgain: () => {
            setChecking(true)
            setFound(null)
            void recheck()
                .then((outcome) => setFound(CHECKED[outcome]))
                .finally(() => setChecking(false))
        },
        open,
    }
}
