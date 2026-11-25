import type { KeptWordsReset } from "@pinai/domain/models/admission"
import type { RecheckOutcome } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"
import { useSyncExternalStore } from "react"

export interface HistoryReset {
    /** Why this device is in by its kept words; `null` when it isn't. */
    reset: KeptWordsReset | null
    recheck: () => Promise<RecheckOutcome>
}

const NONE: HistoryReset = { reset: null, recheck: async () => "failed" }
let current: HistoryReset = NONE
const listeners = new Set<() => void>()

/** The `(app)` layout's gate hands what it found to the banner and its sheet, which sit on other screens. */
export function publishHistoryReset(next: HistoryReset | null): void {
    const value = next ?? NONE
    if (value.reset === current.reset && value.recheck === current.recheck) return
    current = value
    for (const listener of listeners) listener()
}

export function useHistoryReset(): HistoryReset {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        () => current
    )
}
