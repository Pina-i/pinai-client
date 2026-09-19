import { useEffect, useRef, useState } from "react"

/**
 * Smooths a fast `isLoading` flag so it stays truthy for at least
 * `minMs` from the moment it first turned true. Removes the
 * single-frame "flash" UX where async work finishes in 50-150 ms and
 * a loader briefly mounts then immediately unmounts.
 *
 * Behaviour:
 *   - `isLoading` flips false → true: returns true immediately and
 *     records the start time.
 *   - `isLoading` flips true → false BEFORE `minMs` has elapsed: keep
 *     returning true; flip to false once the deadline fires.
 *   - `isLoading` flips true → false AFTER `minMs` has elapsed: flip
 *     to false immediately.
 *   - A fresh true edge after a settled false restarts the minimum.
 *
 * Decoupled from any specific feature — use it anywhere a brief
 * loading state needs a visual floor (onboarding gate, route
 * transitions, optimistic data fetches, etc.).
 */
export function useMinimumLoadingDuration(isLoading: boolean, minMs: number): boolean {
    const [shouldShow, setShouldShow] = useState(isLoading)
    // Seeded by the effect below rather than here: reading the clock during
    // render is impure, and the effect runs on the same commit.
    const startedAtRef = useRef<number | null>(null)

    // `react-hooks/set-state-in-effect` wants derived state instead of state
    // synchronised from an effect. It does not apply here: the whole purpose of
    // the hook is to keep returning `true` after `isLoading` has already gone
    // false, which no derivation of the current props can express — the value
    // is owned by a timer. Deriving `isLoading || holding` instead would leave
    // one frame where both are false on the falling edge, which is precisely
    // the flash this hook exists to remove.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isLoading) {
            // Either just started loading or still loading — note the
            // start time on the rising edge and ensure the visible
            // flag is on. Re-renders within the same loading window
            // don't reset startedAtRef.
            if (startedAtRef.current === null) {
                startedAtRef.current = Date.now()
            }
            setShouldShow(true)
            return
        }
        // Falling edge: decide whether to flip immediately or wait
        // out the remainder of the minimum.
        const startedAt = startedAtRef.current
        if (startedAt === null) {
            // No loading window was ever opened; nothing to settle.
            setShouldShow(false)
            return
        }
        const elapsed = Date.now() - startedAt
        if (elapsed >= minMs) {
            setShouldShow(false)
            startedAtRef.current = null
            return
        }
        const remaining = minMs - elapsed
        const timer = window.setTimeout(() => {
            setShouldShow(false)
            startedAtRef.current = null
        }, remaining)
        return () => window.clearTimeout(timer)
    }, [isLoading, minMs])
    /* eslint-enable react-hooks/set-state-in-effect */

    return shouldShow
}
