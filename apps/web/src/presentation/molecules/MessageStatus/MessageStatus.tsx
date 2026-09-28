import { useEffect, useState } from "react"

import { Check } from "lucide-react"

import type { Message } from "@/lib/types"
import { SENT_FADE_MS, shouldShowSentIcon } from "./MessageStatus.helper"

export interface MessageStatusProps {
    status: Message["status"]
    statusAt?: string
}

/**
 * Inline check rendered next to a message's timestamp on own messages
 * once sent. It auto-hides ~3 s after `statusAt`. Every other status is
 * a line under the body instead — see `MessageDeliveryState`.
 */
export function MessageStatus({ status, statusAt }: MessageStatusProps) {
    // Force a re-render at the fade boundary so the "sent" check
    // disappears without an interval / animation-frame loop. One
    // setTimeout per "sent" message during its visible window.
    const [, tick] = useState(0)
    useEffect(() => {
        if (status !== "sent" || !statusAt) return
        const elapsed = Date.now() - new Date(statusAt).getTime()
        const remaining = SENT_FADE_MS - elapsed
        if (remaining <= 0) return
        const handle = window.setTimeout(() => tick((n) => n + 1), remaining)
        return () => window.clearTimeout(handle)
    }, [status, statusAt])

    if (status === "sent") {
        if (!shouldShowSentIcon(status, statusAt)) return null
        return (
            <span
                role="status"
                aria-live="polite"
                aria-label="Sent"
                className="inline-flex items-center"
            >
                <Check aria-hidden="true" className="h-3 w-3 text-on" />
            </span>
        )
    }

    return null
}
