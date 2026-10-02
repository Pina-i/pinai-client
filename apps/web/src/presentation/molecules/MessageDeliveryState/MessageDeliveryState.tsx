import { ArrowDown, CircleAlert, RotateCcw } from "lucide-react"
import { Button } from "react-aria-components"

import type { Message } from "@/lib/types"
import { cn } from "@/presentation/_libs/utils"

export interface MessageDeliveryStateProps {
    status: Message["status"]
    /** Whether the message still waits to be sent again — the one that gets the retry button. */
    awaitsResend: boolean
    /**
     * Whether the retry button works. False when this device never had the
     * message's plaintext — the button still renders, disabled.
     */
    canRetry: boolean
    onRetry: () => void
    /** The copy an undelivered message was sent again as, when it is known. */
    resentAs?: { timestamp: string; onJump: () => void }
    /** On the copy: jumps back to the undelivered message it replaced. */
    onJumpToOriginal?: () => void
    /** Why it may not have been delivered, shown beside `Not delivered`. */
    undeliveredHint?: string
}


const lineClass = "mt-[7px] flex flex-wrap items-center gap-2 text-[12px]"

const retryClass = cn(
    "inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-full px-[11px]",
    "border border-[color-mix(in_oklab,var(--dnd)_45%,transparent)] bg-[color-mix(in_oklab,var(--dnd)_14%,transparent)]",
    "text-[12px] font-medium text-foreground outline-none transition-[background-color] duration-150",
    "hover:bg-[color-mix(in_oklab,var(--dnd)_24%,transparent)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dnd",
    "disabled:cursor-not-allowed disabled:opacity-50",
)

const linkClass = cn(
    "inline-flex cursor-pointer items-center gap-[5px] text-[12px] text-muted-foreground outline-none",
    "underline decoration-line2 underline-offset-[3px] hover:text-foreground hover:decoration-current",
    "focus-visible:ring-2 focus-visible:ring-ring",
)

/**
 * The line under an own message about its delivery, none while the send is in flight:
 *
 * - a red `Not delivered` with a retry button while the message waits to be
 *   sent again;
 * - a quiet `Not delivered · Sent again at …` once it was, linking to the copy;
 * - `Resent` under that copy, linking back.
 */
export function MessageDeliveryState({
    status,
    awaitsResend,
    canRetry,
    onRetry,
    resentAs,
    onJumpToOriginal,
    undeliveredHint,
}: MessageDeliveryStateProps) {
    if (status === "sending") return null

    if (status === "failed" || status === "undelivered") {
        if (awaitsResend) {
            return (
                <div
                    role="alert"
                    className={lineClass}
                >
                    <span className="inline-flex items-center gap-1.5 text-dnd">
                        <CircleAlert
                            aria-hidden
                            className="h-3.5 w-3.5"
                        />
                        Not delivered
                    </span>
                    {undeliveredHint && <span className="text-[11.5px] text-muted-foreground">{undeliveredHint}</span>}
                    <Button
                        onPress={onRetry}
                        isDisabled={!canRetry}
                        aria-label={canRetry ? "Retry sending" : "Retry sending — this device doesn't have the message's text"}
                        className={retryClass}
                    >
                        <RotateCcw
                            aria-hidden
                            className="h-3 w-3"
                        />
                        Retry
                    </Button>
                </div>
            )
        }

        return (
            <div className={lineClass}>
                <span className="inline-flex items-center gap-1.5 text-[color-mix(in_oklab,var(--dnd)_75%,var(--muted-foreground))]">
                    <CircleAlert
                        aria-hidden
                        className="h-3.5 w-3.5"
                    />
                    Not delivered
                </span>
                <span
                    aria-hidden
                    className="text-line2"
                >
                    ·
                </span>
                {resentAs ? (
                    <Button
                        onPress={resentAs.onJump}
                        className={linkClass}
                    >
                        Sent again at <span className="font-mono text-[10.5px]">{resentAs.timestamp}</span>
                        <ArrowDown
                            aria-hidden
                            className="h-3 w-3"
                        />
                    </Button>
                ) : (
                    <span className="text-muted-foreground">Sent again</span>
                )}
            </div>
        )
    }

    if (onJumpToOriginal) {
        return (
            <div className={lineClass}>
                <Button
                    onPress={onJumpToOriginal}
                    className={linkClass}
                >
                    <RotateCcw
                        aria-hidden
                        className="h-3 w-3"
                    />
                    Resent
                </Button>
            </div>
        )
    }

    return null
}
