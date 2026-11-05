import { createContext, useContext } from "react"

import type { KeptWordsReset } from "@pinai/domain/models/admission"

/** `checked`: the IdP answered; `offline`: decided on what was recorded; `failed`: no decision. */
export type RecheckOutcome = "checked" | "offline" | "failed"

/** The onboarding gate's word on a device in by its kept words, and a way to check again. */
export interface HistoryResetContextValue {
    reset: KeptWordsReset | null
    recheck: () => Promise<RecheckOutcome>
}

export const HistoryResetContext = createContext<HistoryResetContextValue>({ reset: null, recheck: async () => "failed" })

export function useHistoryReset(): HistoryResetContextValue {
    return useContext(HistoryResetContext)
}
