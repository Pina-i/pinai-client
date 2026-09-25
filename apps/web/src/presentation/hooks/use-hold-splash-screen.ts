import { useLayoutEffect } from "react"
import { holdSplashScreen, type SplashHoldOptions } from "@/presentation/_libs/splash-screen"

// A layout effect, so the hold is in place before the router reports the page rendered.
export function useHoldSplashScreen(active: boolean, { reshow }: SplashHoldOptions = {}): void {
    useLayoutEffect(() => (active ? holdSplashScreen({ reshow }) : undefined), [active, reshow])
}
