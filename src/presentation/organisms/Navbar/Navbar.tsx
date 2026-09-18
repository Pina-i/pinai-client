import type { ReactNode } from "react"
import { ThemeSwitcher } from "@/presentation/molecules/ThemeSwitcher/ThemeSwitcher"
import { NotificationsPopover } from "@/presentation/organisms/AppHeader/NotificationsPopover/NotificationsPopover"

/**
 * App-wide top bar. The fixed cluster (theme switcher + notifications) is
 * always rendered on the right and never shrinks; `children` are injected on
 * the left inside a `min-w-0` track, so long contextual content truncates
 * instead of pushing the fixed controls off-screen.
 */
export function Navbar({ children }: { children?: ReactNode }) {
    return (
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
            <div className="flex shrink-0 items-center gap-2">
                <ThemeSwitcher />
                <NotificationsPopover />
            </div>
        </header>
    )
}
