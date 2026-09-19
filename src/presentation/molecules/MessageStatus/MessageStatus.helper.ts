import type { Message } from "@/lib/types"

/**
 * How long the "sent" check stays visible after `statusAt` before fading
 * entirely so old messages don't carry a permanent check stamp. On reload
 * the comparison naturally falls outside the window — no flash.
 */
export const SENT_FADE_MS = 3000

/**
 * Should the "sent" check icon currently render? Returns `false` for any
 * non-"sent" status (which have their own render path), for missing
 * `statusAt`, and once more than {@link SENT_FADE_MS} has elapsed since the
 * status flip.
 */
export function shouldShowSentIcon(
    status: Message["status"],
    statusAt: string | undefined,
    now: number = Date.now(),
): boolean {
    if (status !== "sent" || !statusAt) return false
    return now - new Date(statusAt).getTime() < SENT_FADE_MS
}
