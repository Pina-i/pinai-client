import { EllipsisVertical, MessageSquare } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { ContextMenuTrigger } from "@/presentation/molecules/ContextMenu/ContextMenuTrigger"
import { buildUserContextMenuItems } from "@/presentation/molecules/UserContextMenu/UserContextMenu.items"
import { cn } from "@/presentation/_libs/utils"
import { useConversationMute } from "@/presentation/hooks/useConversationMute"
import { findConversation } from "@pinai/domain/models/dm"
import { userStatusLabel } from "@pinai/domain/models/presence"
import { useAppStore } from "@/store/store"
import type { Friend } from "../FriendsPanel.viewmodel"

interface FriendRowProps {
    friend: Friend
    /** True while this row's context menu is open. */
    isActive?: boolean
    onOpen: (address: string) => void
    onProfile: (friend: Friend) => void
    onRemove: (friend: Friend) => void
    onBlock: (friend: Friend) => void
}

export function FriendRow({ friend, isActive, onOpen, onProfile, onRemove, onBlock }: FriendRowProps) {
    const initials = friend.name
        .split(" ")
        .map((n) => n[0])
        .join("")

    const privateDmId = useAppStore((s) => findConversation(s.localDmConvos, friend.address)?.id)
    const { isMuted, toggleMute } = useConversationMute(privateDmId)

    const menuItems = buildUserContextMenuItems({
        onMessage: () => onOpen(friend.address),
        onProfile: () => onProfile(friend),
        onRemove: () => onRemove(friend),
        onToggleMute: toggleMute,
        isMuted,
        onBlock: () => onBlock(friend),
    })

    return (
        <div
            onClick={() => onOpen(friend.address)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onOpen(friend.address)}
            className={cn(
                "flex cursor-pointer items-center gap-3 rounded-full px-3.5 py-2.5 outline-none transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "bg-surf2" : "hover:bg-surf has-[[aria-expanded=true]]:bg-surf2",
            )}
        >
            <Avatar
                initials={initials}
                imageUrl={friend.avatarUrl}
                seed={friend.address}
                size="md"
                status={friend.status}
            />
            <span className="min-w-0 flex-1 overflow-hidden">
                <span className="title block truncate text-[15px] font-semibold text-foreground">{friend.name}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{friend.address}</span>
            </span>
            <span className="min-w-0 shrink truncate text-[12px] text-muted-foreground max-[1180px]:hidden">
                {userStatusLabel(friend.status)}
            </span>
            {/* The menu portals, but React still bubbles its presses up the tree — stop them before the row. */}
            <span
                className="flex shrink-0 items-center gap-3"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >
                <IconButton variant="ghost" aria-label={`Message ${friend.name}`} onPress={() => onOpen(friend.address)}>
                    <MessageSquare className="h-[17px] w-[17px]" />
                </IconButton>
                <ContextMenuTrigger
                    label={`Actions for ${friend.name}`}
                    items={menuItems}
                    trigger={
                        <IconButton
                            variant="ghost"
                            aria-label={`Actions for ${friend.name}`}
                            className="aria-expanded:bg-surf3 aria-expanded:text-foreground"
                        >
                            <EllipsisVertical className="h-[17px] w-[17px]" />
                        </IconButton>
                    }
                />
            </span>
        </div>
    )
}
