import type { ReactNode } from "react"
import { ThemeSwitcher } from "@/presentation/molecules/ThemeSwitcher/ThemeSwitcher"
import { NotificationsPopover } from "@/presentation/organisms/AppHeader/NotificationsPopover/NotificationsPopover"

interface NavbarProps {
    /** Leading icon/avatar and title block. Truncates rather than pushing the actions off-screen. */
    children?: ReactNode
    /** Contextual actions placed before the fixed bell + theme cluster. */
    actions?: ReactNode
}

export function Navbar({ children, actions }: NavbarProps) {
    return (
        <header className="relative flex h-[58px] shrink-0 items-center gap-3 pl-1 pr-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
            <div className="flex shrink-0 items-center gap-2">
                {actions}
                <NotificationsPopover />
                <ThemeSwitcher />
            </div>
        </header>
    )
}
