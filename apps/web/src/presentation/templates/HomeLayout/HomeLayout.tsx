import type { ReactNode } from "react"
import { getAuthPlatform } from "@/ioc/index"
import { useAppStore } from "@/store/store"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"
import { findConversation } from "@pinai/domain/models/dm"
import { ServerStrip } from "@/presentation/organisms/ServerStrip/ServerStrip"
import { ChannelSidebar } from "@/presentation/organisms/ChannelSidebar/ChannelSidebar"
import { AppHeader } from "@/presentation/organisms/AppHeader/AppHeader"
import { MembersSidebar } from "@/presentation/organisms/MembersSidebar/MembersSidebar"
import { UserProfileModal } from "@/presentation/pages/home/UserProfileModal/UserProfileModal"
import { SettingsModal } from "@/presentation/pages/home/SettingsModal/SettingsModal"
import { GroupComposer } from "@/presentation/pages/home/GroupComposer/GroupComposer"
import { GroupMembersPanel } from "@/presentation/pages/home/GroupMembersPanel/GroupMembersPanel"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { useOpenConversationRef } from "@/presentation/hooks/useOpenConversationRef"

interface HomeLayoutProps {
    children: ReactNode
}

export function HomeLayout({ children }: HomeLayoutProps) {
    const view = useAppStore((s) => s.view)
    const showMembers = useAppStore((s) => s.showMembers)
    const showUserProfile = useAppStore((s) => s.showUserProfile)
    const setShowUserProfile = useAppStore((s) => s.setShowUserProfile)
    const showSettings = useAppStore((s) => s.showSettings)
    const setShowSettings = useAppStore((s) => s.setShowSettings)
    const openDmWith = useAppStore((s) => s.openDmWith)
    const user = useAppStore((s) => s.user)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const clearSession = useAppStore((s) => s.clearSession)

    // Resolve the open group from the route (reactive + synchronous) rather
    // than the effect-set `activeDm`, so the panel tracks navigation without
    // the mount/cleanup race that hid it when re-entering a group.
    const dmParam = useOpenConversationRef()
    // Only the id: a conversation-list refresh must not re-render the whole shell.
    const activeGroupId = useAppStore((s) => {
        const open = dmParam ? findConversation(s.localDmConvos, dmParam) : undefined
        return open?.kind === "group" && !open.removedAt ? open.id : undefined
    })

    if (!user) return null

    return (
        <div className="relative flex h-screen w-full overflow-hidden bg-background">
            <Backdrop />
            <ServerStrip />
            <ChannelSidebar />

            <main className="relative z-[2] m-3 flex min-w-0 flex-1 flex-col">
                <AppHeader />
                <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
            </main>

            {view === "server" && showMembers && <MembersSidebar />}
            {activeGroupId && <GroupMembersPanel conversationId={activeGroupId} />}

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
