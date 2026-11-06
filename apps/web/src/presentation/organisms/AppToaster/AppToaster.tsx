import { Toaster } from "sonner"

import { useAppearance } from "@/presentation/providers/AppearanceProvider/AppearanceProvider.context"

/** The corner's toasts, in the mode the app is painted in. */
export function AppToaster() {
    const { mode } = useAppearance()
    return <Toaster theme={mode} richColors position="bottom-right" style={{ zIndex: "var(--z-above-grain)" }} />
}
