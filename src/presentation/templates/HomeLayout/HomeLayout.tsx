import type { ReactNode } from "react"
import { useAppStore } from "@/store/store"
import { logoutUseCase } from "@/domain/usecases/auth/logout.usecase"
import { ServerStrip } from "@/presentation/organisms/ServerStrip/ServerStrip"
import { ChannelSidebar } from "@/presentation/organisms/ChannelSidebar/ChannelSidebar"
import { AppHeader } from "@/presentation/organisms/AppHeader/AppHeader"
import { MembersSidebar } from "@/presentation/organisms/MembersSidebar/MembersSidebar"
import { UserProfileModal } from "@/presentation/pages/home/UserProfileModal/UserProfileModal"
import { SettingsModal } from "@/presentation/pages/home/SettingsModal/SettingsModal"

interface HomeLayoutProps {
    children: ReactNode
}

export function HomeLayout({ children }: HomeLayoutProps) {
    const {
        view,
        showMembers,
        showUserProfile,
        setShowUserProfile,
        showSettings,
        setShowSettings,
        openDmWith,
        user,
        idpUrl,
        clearSession,
    } = useAppStore()

    if (!user) return null

    return (
        <div className="flex h-screen w-full overflow-hidden">
            <ServerStrip />
            <ChannelSidebar />

            <div className="flex flex-1 flex-col bg-background">
                <AppHeader />
                <div className="flex flex-1 overflow-hidden">
                    {children}
                    {view === "server" && showMembers && <MembersSidebar />}
                </div>
            </div>

            <UserProfileModal
                member={showUserProfile}
                onClose={() => setShowUserProfile(null)}
                onSendMessage={(name) => {
                    setShowUserProfile(null)
                    openDmWith(name)
                }}
            />

            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                username={user.preferred_username}
                email={user.email}
                onLogout={() => logoutUseCase(idpUrl!, clearSession)}
            />
        </div>
    )
}
