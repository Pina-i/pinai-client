import { useEffect } from "react"

import { getWindowFramePort } from "@/ioc/index"
import { hexColor } from "@/presentation/_libs/hex-color"
import { useAppearance } from "@/presentation/providers/AppearanceProvider/AppearanceProvider.context"

/** Colours the system's window buttons like the bar under them, at every palette or mode change. */
export function useTitleBarViewModel() {
    const { appearance, mode } = useAppearance()

    // After AppearanceProvider's layout effect: <html> already carries the new theme.
    useEffect(() => {
        const style = getComputedStyle(document.documentElement)
        const background = hexColor(style.getPropertyValue("--background"))
        const symbols = hexColor(style.getPropertyValue("--muted-foreground"))
        if (!background || !symbols) return
        // A refused paint leaves the buttons in their last colours.
        getWindowFramePort().paintTitleBar({ background, symbols }).catch(() => {})
    }, [appearance.family, mode])
}
