import { useEffect, useState } from "react"

import { AlertCircle, Check, Clock, RotateCw } from "lucide-react"

import type { Message } from "@/lib/types"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"
import { SENT_FADE_MS, shouldShowSentIcon } from "./MessageStatus.helper"

export interface MessageStatusProps {
    status: Message["status"]
    statusAt?: string
    /**
     * Whether the user can retry a failed send. False after a reload
     * (the in-memory send-intent map is session-only) — the retry
     * button still renders but is disabled.
     */
    canRetry: boolean
    onRetry: () => void
}

/**
 * Inline status indicator rendered next to a message's timestamp on
 * own messages. Maps the three `Message.status` values to small
 * `lucide-react` icons + (for failed sends) a retry icon-button.
 *
 * The "sent" check auto-hides ~3 s after `statusAt`; "sending" and
 * "failed" stay visible until the next status transition.
 */
export function MessageStatus({ status, statusAt, canRetry, onRetry }: MessageStatusProps) {
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
                <Clock aria-hidden="true" className="h-3 w-3 text-muted-foreground/70" />
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
                <Check aria-hidden="true" className="h-3 w-3 text-muted-foreground/70" />
            </span>
        )
    }

    // status === "failed"
    return (
        <span
            role="status"
            aria-live="polite"
            aria-label="Failed to send"
            className="inline-flex items-center gap-1"
        >
            <AlertCircle aria-hidden="true" className="h-3 w-3 text-destructive" />
            <IconButton
                aria-label="Retry sending"
                isDisabled={!canRetry}
                onPress={onRetry}
                className={cn("rounded p-0.5 hover:bg-accent/50")}
            >
                <RotateCw aria-hidden="true" className="h-3 w-3 text-destructive" />
            </IconButton>
        </span>
    )
}
