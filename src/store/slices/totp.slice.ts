import type { StateCreator } from "zustand"
import type { AppStore } from "../store"

/**
 * Transient ferry for one-time-display recovery codes between the verify call
 * and the dedicated /recovery-codes page. Lives off the persisted slice so the
 * codes are inevitably wiped on reload.
 */
export interface TotpSlice {
    pendingRecoveryCodes: string[] | null
    setPendingRecoveryCodes: (codes: string[] | null) => void
}

export const createTotpSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], TotpSlice> = (set) => ({
    pendingRecoveryCodes: null,
    setPendingRecoveryCodes: (codes) =>
        set({ pendingRecoveryCodes: codes }, false, "totp/setPendingRecoveryCodes"),
})
