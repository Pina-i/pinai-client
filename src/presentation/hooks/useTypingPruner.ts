import { useEffect } from "react"
import { useAppStore } from "@/store/store"

const PRUNE_INTERVAL_MS = 1000

/**
 * Periodically clears typing indicators whose 3s TTL has expired.
 * Cheap — runs in O(active conversations) per tick.
 */
export function useTypingPruner(): void {
    const pruneExpiredTyping = useAppStore((s) => s.pruneExpiredTyping)

    useEffect(() => {
        const interval = setInterval(() => pruneExpiredTyping(Date.now()), PRUNE_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [pruneExpiredTyping])
}
