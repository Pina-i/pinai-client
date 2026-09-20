import type { ReactNode } from "react"
import { useLocation } from "@tanstack/react-router"
import { getAuthPlatform } from "@/ioc/index"
import { useAppStore } from "@/store/store"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"
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
        localDmConvos,
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

    // Resolve the open group from the route (reactive + synchronous) rather
    // than the effect-set `activeDm`, so the panel tracks navigation without
    // the mount/cleanup race that hid it when re-entering a group.
    const { pathname } = useLocation()
    const dmParam = pathname.startsWith("/dm/") ? decodeURIComponent(pathname.slice(4)) : null
    const activeGroup = dmParam
        ? localDmConvos.find((d) => (d.id === dmParam || d.address === dmParam) && d.kind === "group")
        : undefined

    if (!user) return null

    return (
        <div className="flex h-screen w-full overflow-hidden">
            <ServerStrip />
            <ChannelSidebar />

            <div className="flex min-w-0 flex-1 flex-col bg-background">
                <AppHeader />
                <div className="flex min-w-0 flex-1 overflow-hidden">
                    {children}
                    {view === "server" && showMembers && <MembersSidebar />}
                    {activeGroup && <GroupMembersPanel conversationId={activeGroup.id} />}
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
                onLogout={() => logoutUseCase(idpUrl!, clearSession, getAuthPlatform())}
            />
        </div>
    )
}
