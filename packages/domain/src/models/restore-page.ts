import type { ResetCause } from "./admission"
import type { AskingState } from "./start-over"

/** The page of a device that never held the account's words (`new-device`), or whose words no longer give its key (`reset`). */
export type RestoreVariant = "new-device" | "reset"

/** "Another device" / "That device", "My 24 words" / "Its 24 words", "Start over" / "Start over from here". */
export type RestoreTab = "device" | "words" | "start-over"

export const RESTORE_TABS: readonly RestoreTab[] = ["device", "words", "start-over"]

/**
 * Another device's code and the 24 words can let this device in: never on a reset no start over
 * explains — no device holds the key the instance put in, and the old words are refused.
 */
export function offersWayIn(variant: RestoreVariant, cause: ResetCause | null): boolean {
    return variant === "new-device" || cause === "newer-generation"
}

/** Start over is offered to a device that isn't in: one let in only came to bring its history. */
export function offersStartOver(isIn: boolean): boolean {
    return !isIn
}

/** A device found in has no Start over tab: it opens on another way in. */
export function shownTab(tab: RestoreTab, isIn: boolean): RestoreTab {
    return !offersStartOver(isIn) && tab === "start-over" ? "device" : tab
}

/** A start over takes the words itself: a share kept meanwhile must not carry the page off before they are shown. */
export function listensForShare(page: {
    lacksWords: boolean
    settingUp: boolean
    failed: boolean
    startingOver: boolean
    showingNewWords: boolean
}): boolean {
    return page.lacksWords && !page.settingUp && !page.failed && !page.startingOver && !page.showingNewWords
}

/** A request this device asked, or how it ended, is said on its own tab: the page opens there, unless the user chose one. */
export function openingTab(ownState: AskingState["kind"] | null): RestoreTab | null {
    return ownState === "waiting" || ownState === "ready" || ownState === "cancelled" || ownState === "superseded" ? "start-over" : null
}

/** A share failed its checks and no approval here explains it: the page says so and points to the words. */
export function shareRefused(share: { kind: string } | null, approvedHere: boolean): boolean {
    return share?.kind === "unusable" && !approvedHere
}
