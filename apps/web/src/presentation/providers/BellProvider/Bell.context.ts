import { createContext, useContext } from "react"

/** The bell's read mark, shared by the bell and the window's title. */
export interface BellContextValue {
    /** The notifications' ids when the bell was last opened. */
    seenIds: ReadonlySet<string>
    setSeenIds: (ids: ReadonlySet<string>) => void
}

export const BellContext = createContext<BellContextValue>({ seenIds: new Set(), setSeenIds: () => {} })

export function useBell(): BellContextValue {
    return useContext(BellContext)
}
