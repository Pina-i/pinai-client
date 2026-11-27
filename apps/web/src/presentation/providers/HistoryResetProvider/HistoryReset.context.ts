import { createContext, useContext } from "react"

import type { KeptWordsReset } from "@pinai/domain/models/admission"
import type { RecheckOutcome } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"

export type { RecheckOutcome } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"

/** The onboarding gate's word on a device in by its kept words, and a way to check again. */
export interface HistoryResetContextValue {
    reset: KeptWordsReset | null
    recheck: () => Promise<RecheckOutcome>
}

export const HistoryResetContext = createContext<HistoryResetContextValue>({ reset: null, recheck: async () => "failed" })

export function useHistoryReset(): HistoryResetContextValue {
    return useContext(HistoryResetContext)
}
