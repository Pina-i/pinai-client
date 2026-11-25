import type { HandshakeFailure } from "@pinai/domain/models/approval-handshake"
import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import type { AskingState, EnteringState } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"

function wentWith(failure: HandshakeFailure | null): string {
    switch (failure) {
        case "wrong-code":
            return "That code didn't match on your other device."
        case "keys-refused":
            return "Your instance listed other keys for that device. Nothing was approved."
        case "tampered":
            return "Something changed the messages between your devices. Nothing was approved."
        case "expired":
            return "That code ran out after it was typed. Nothing was approved."
        default:
            return "That request ended without approving this device."
    }
}

/** The line under the code while this device asks; `time` words a moment of the day. */
export function askingLine(state: AskingState, time: (at: number) => string): string | null {
    switch (state.kind) {
        case "starting":
            return "Asking your instance for a code…"
        case "showing":
            if (state.phase === "confirming") return "Your other device is checking the code…"
            if (state.phase === "approving") return "Approving this device…"
            return null
        case "waiting":
            if (state.why === "unreachable") return "Couldn't reach your instance. Trying again…"
            return `Too many codes asked for this hour. A new one at ${time(state.until)}.`
        case "stopped":
            return wentWith(state.failure)
        case "paused":
            return null
        case "approved":
            return "This device is approved."
        case "holds":
            return "This device already holds your history passphrase."
    }
}

/** The line once approved: the phone keeps no messages yet, so nothing is restored here. */
export function arrivalLine(entering: EnteringState | null, share: AwaitedShareState | null): string {
    const isIn = entering?.kind === "in"
    if (share?.kind === "unusable") return "Approved, but your history couldn't be received from that device. Type your 24 words to bring it back."
    if (!isIn && (entering?.kind === "refused" || share?.kind === "ended")) return "Your instance refused to let this device in."
    if (!isIn && share?.kind !== "kept" && entering?.kind === "entering" && entering.waiting) {
        return "Approved. Waiting for your other device to finish: it hasn't yet said it holds your history passphrase."
    }
    return "Approved — opening Pīna'i…"
}
