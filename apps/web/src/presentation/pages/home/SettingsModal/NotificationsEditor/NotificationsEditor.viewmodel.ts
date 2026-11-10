import { useEffect, useState } from "react"
import { toast } from "sonner"

import type { ComesBackBy } from "@pinai/domain/ports/keep-running.port"
import { getKeepRunningPort } from "@/ioc"

export const KEEP_RUNNING_LABEL = "Keep receiving messages when the window is closed"

export function keepRunningDescription(comesBackBy: ComesBackBy): string {
    switch (comesBackBy) {
        case "tray":
            return "Pīna'i stays in the tray, its icon showing a dot when something waits for you. Quit from its menu, or with Ctrl+Q."
        case "dock":
            return "Pīna'i stays in the Dock, its icon counting what waits for you. Quit with ⌘Q."
        case "launch":
            return "Pīna'i keeps running without a window: open it again to bring the window back. Quit with Ctrl+Q."
    }
}

/** The desktop app's only: a browser tab has no window of its own to close. */
export type KeepRunningToggle =
    | { kind: "absent" }
    /** Until the main process answers: neither on nor off. */
    | { kind: "pending"; label: string }
    | { kind: "shown"; label: string; description: string; isSelected: boolean }

export interface NotificationsEditorViewModel {
    keepRunning: KeepRunningToggle
    setKeepRunning: (keepRunning: boolean) => void
}

export function useNotificationsEditorViewModel(): NotificationsEditorViewModel {
    const port = getKeepRunningPort()
    const [chosen, setChosen] = useState<boolean | null>(null)
    const [comesBackBy, setComesBackBy] = useState<ComesBackBy>("tray")
    const [unreadable, setUnreadable] = useState(false)

    useEffect(() => {
        if (!port) return
        let live = true
        port.get().then(
            (setting) => {
                if (!live) return
                setChosen(setting.keepRunning)
                setComesBackBy(setting.comesBackBy)
            },
            () => live && setUnreadable(true),
        )
        return () => {
            live = false
        }
    }, [port])

    function setKeepRunning(keepRunning: boolean): void {
        if (!port || chosen === null || keepRunning === chosen) return
        const before = chosen
        setChosen(keepRunning)
        port.set(keepRunning).catch(() => {
            setChosen(before)
            toast.error("Couldn't save this setting")
        })
    }

    return {
        keepRunning:
            !port || unreadable
                ? { kind: "absent" }
                : chosen === null
                  ? { kind: "pending", label: KEEP_RUNNING_LABEL }
                  : {
                        kind: "shown",
                        label: KEEP_RUNNING_LABEL,
                        description: keepRunningDescription(comesBackBy),
                        isSelected: chosen,
                    },
        setKeepRunning,
    }
}
