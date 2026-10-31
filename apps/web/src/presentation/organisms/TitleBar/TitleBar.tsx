import { useTitleBarViewModel } from "./TitleBar.viewmodel"

/**
 * The desktop app's title bar. The bar itself is static in `index.html` (`.pn-titlebar`), there
 * from the first paint; this keeps the system's buttons over its end in its colours.
 */
export function TitleBar() {
    useTitleBarViewModel()
    return null
}
