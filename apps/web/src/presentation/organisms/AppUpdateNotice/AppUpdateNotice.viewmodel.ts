import { useEffect } from "react"
import { toast } from "sonner"

import type { AppUpdate } from "@pinai/domain/ports/app-updates.port"
import { getAppUpdatesPort } from "@/ioc/index"

export interface Notice {
    message: string
    description: string
    action: { label: string; run: "restart" | "download" }
}

// One toast: a newer version replaces it in place.
const NOTICE_ID = "app-update"

/** What the app says about its update, if anything. */
export function noticeOf(update: AppUpdate): Notice | null {
    switch (update.kind) {
        case "ready":
            return {
                message: "An update is ready",
                description: `Version ${update.version}`,
                action: { label: "Restart", run: "restart" },
            }
        case "available":
            return {
                message: "A new version is available",
                description: `Version ${update.version}`,
                action: { label: "Download", run: "download" },
            }
        case "none":
            return null
    }
}

export function useAppUpdateNoticeViewModel(): void {
    useEffect(() => {
        const port = getAppUpdatesPort()
        const show = (update: AppUpdate) => {
            const notice = noticeOf(update)
            if (!notice) return
            const { run } = notice.action
            toast(notice.message, {
                id: NOTICE_ID,
                description: notice.description,
                // Until acted on: ignored, a downloaded update installs when the app quits anyway.
                duration: Infinity,
                closeButton: true,
                action: {
                    label: notice.action.label,
                    onClick: (event) => {
                        // Stays up until the app quits: if the install fails, the notice is still true.
                        if (run === "restart") event.preventDefault()
                        port[run]().catch(() => {})
                    },
                },
            })
        }
        void port.status().then(show)
        return port.onChange(show)
    }, [])
}
