import { useEffect, useState } from "react"

import { AlertCircle, Check, Clock, RotateCw } from "lucide-react"

import type { Message } from "@/lib/types"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { SENT_FADE_MS, shouldShowSentIcon } from "./MessageStatus.helper"

export interface MessageStatusProps {
    status: Message["status"]
    statusAt?: string
    /** Whether a failed or undelivered message offers a retry button at all. */
    showRetry: boolean
    /**
     * Whether that button works. False when this device never had the
     * message's plaintext — the button still renders, disabled.
     */
    canRetry: boolean
    onRetry: () => void
}

/**
 * Inline status indicator rendered next to a message's timestamp on
 * own messages. Maps the `Message.status` values to small
 * `lucide-react` icons + (for failed or undelivered sends) a retry
 * icon-button.
 *
 * The "sent" check auto-hides ~3 s after `statusAt`; the other
 * statuses stay visible until the next status transition.
 */
export function MessageStatus({ status, statusAt, showRetry, canRetry, onRetry }: MessageStatusProps) {
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

    if (!status) return null

    if (status === "sending") {
        return (
            <span
                role="status"
                aria-live="polite"
                aria-label="Sending"
                className="inline-flex items-center"
            >
                <Clock aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
            </span>
        )
    }

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

    // status === "failed" | "undelivered"
    return (
        <span
            role="status"
            aria-live="polite"
            aria-label={status === "failed" ? "Failed to send" : "Not delivered to the recipient's server"}
            className="inline-flex items-center gap-1"
        >
            <AlertCircle aria-hidden="true" className="h-3 w-3 text-dnd" />
            {showRetry && (
                <IconButton
                    aria-label="Retry sending"
                    isDisabled={!canRetry}
                    onPress={onRetry}
                    className="rounded-full p-0.5 text-dnd hover:bg-[color-mix(in_oklab,var(--dnd)_14%,transparent)]"
                >
                    <RotateCw aria-hidden="true" className="h-3 w-3" />
                </IconButton>
            )}
        </span>
    )
}
