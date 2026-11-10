import { type ReactNode, useMemo, useState } from "react"

import { BellContext } from "./Bell.context"

/** Held by the signed-in layout, so the window's title reads the bell's unread; gone with it at sign-out. */
export function BellProvider({ children }: { children: ReactNode }) {
    const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(() => new Set())
    const value = useMemo(() => ({ seenIds, setSeenIds }), [seenIds])
    return <BellContext.Provider value={value}>{children}</BellContext.Provider>
}
