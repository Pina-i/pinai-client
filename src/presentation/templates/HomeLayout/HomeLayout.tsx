import type { ReactNode } from "react"
import { useAppStore } from "@/store/store"
import { logoutUseCase } from "@/domain/usecases/auth/logout.usecase"
import { ServerStrip } from "@/presentation/organisms/ServerStrip/ServerStrip"
import { ChannelSidebar } from "@/presentation/organisms/ChannelSidebar/ChannelSidebar"
import { AppHeader } from "@/presentation/organisms/AppHeader/AppHeader"
import { MembersSidebar } from "@/presentation/organisms/MembersSidebar/MembersSidebar"
import { UserProfileModal } from "@/presentation/pages/home/UserProfileModal/UserProfileModal"
import { SettingsModal } from "@/presentation/pages/home/SettingsModal/SettingsModal"
import { GroupComposer } from "@/presentation/pages/home/GroupComposer/GroupComposer"
import { GroupMembersPanel } from "@/presentation/pages/home/GroupMembersPanel/GroupMembersPanel"

interface HomeLayoutProps {
    children: ReactNode
}

export function HomeLayout({ children }: HomeLayoutProps) {
    const {
        view,
        activeDm,
        localDmConvos,
        showMembers,
        showGroupMembers,
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

    const activeIsGroup = localDmConvos.find((d) => d.id === activeDm)?.kind === "group"

    return (
        <div className="flex h-screen w-full overflow-hidden">
            <ServerStrip />
            <ChannelSidebar />

            <div className="flex flex-1 flex-col bg-background">
                <AppHeader />
                <div className="flex flex-1 overflow-hidden">
                    {children}
                    {view === "server" && showMembers && <MembersSidebar />}
                    {view === "dms" && activeIsGroup && showGroupMembers && <GroupMembersPanel />}
                </div>
            </div>

            <GroupComposer />

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
                user={user}
                onLogout={() => logoutUseCase(idpUrl!, clearSession)}
            />
        </div>
    )
}
