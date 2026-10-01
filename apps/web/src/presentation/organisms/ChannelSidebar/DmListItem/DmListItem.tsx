import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "react-aria-components"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { ContextMenu } from "@/presentation/molecules/ContextMenu/ContextMenu"
import { UserContextMenu } from "@/presentation/molecules/UserContextMenu/UserContextMenu"
import { RemoveFriendModal } from "@/presentation/molecules/RemoveFriendModal/RemoveFriendModal"
import { BlockUserModal } from "@/presentation/molecules/BlockUserModal/BlockUserModal"
import { useIsFriend, useRemoveFriend } from "@/presentation/hooks/useRemoveFriend"
import { useBlockUser, useBlocks } from "@/presentation/hooks/useBlocks"
import { isBlocked } from "@pinai/domain/models/block"
import { GroupContextMenu } from "@/presentation/molecules/GroupContextMenu/GroupContextMenu"
import { cn } from "@/presentation/_libs/utils"
import { presenceToUserStatus, userStatusLabel } from "@pinai/domain/models/presence"
import { useAppStore } from "@/store/store"
import { useConversationMute } from "@/presentation/hooks/useConversationMute"
import type { DmConversation } from "@/lib/types"
import { lastMessagePreview } from "../_helpers/last-message-preview.helper"
import { UnreadPill } from "../UnreadPill/UnreadPill"
import { sidebarRowClass, sidebarRowHotClass, sidebarRowOnClass } from "../sidebar-row.styles"

export function DmListItem({ dm }: { dm: DmConversation }) {
    const navigate = useNavigate()
    // Narrow selectors so only the affected row re-renders, not the whole list.
    const isActive = useAppStore((s) => s.activeDm === dm.id)
    const unread = useAppStore((s) => s.dmUnread[dm.id] ?? 0)
    const presence = useAppStore((s) => s.presenceByAddress[dm.address])
    const avatarUrl = useAppStore((s) => (dm.kind === "dm" ? s.avatarsByAddress[dm.address] ?? null : null))
    const messages = useAppStore((s) => s.dmMessages[dm.id])
    const myAddress = useAppStore((s) => s.user?.address)
    const { isMuted, toggleMute } = useConversationMute(dm.id)

    const preview = dm.kind === "dm" ? lastMessagePreview(messages, myAddress) : null
    // A message preview is prose; a member count or presence label is a machine fact.
    const subline =
        dm.kind === "group"
            ? `${dm.memberCount} ${dm.memberCount === 1 ? "member" : "members"}`
            : (preview ?? userStatusLabel(presenceToUserStatus(presence)).toLowerCase())
    const sublineIsFact = preview == null

    const peerActorUri = dm.kind === "dm" ? dm.actorUri : null
    const isFriend = useIsFriend(peerActorUri)
    const { removeFriend, isRemoving } = useRemoveFriend()
    const [isConfirmingRemove, setIsConfirmingRemove] = useState(false)
    const { blocked } = useBlocks()
    const peerBlocked = !!peerActorUri && isBlocked(blocked, peerActorUri)
    const { block, unblock, isPending: isBlocking } = useBlockUser()
    const [isConfirmingBlock, setIsConfirmingBlock] = useState(false)

    async function handleConfirmRemove() {
        if (peerActorUri && (await removeFriend(peerActorUri, dm.displayName))) setIsConfirmingRemove(false)
    }

    async function handleConfirmBlock() {
        if (peerActorUri && (await block(peerActorUri, dm.displayName))) setIsConfirmingBlock(false)
    }

    return (
        <>
            <ContextMenu
                trigger={(isOpen) => (
                    <Button
                        onPress={() => navigate({ to: "/dm/$name", params: { name: dm.id } })}
                        className={cn(sidebarRowClass, isActive ? sidebarRowOnClass : isOpen && sidebarRowHotClass)}
                    >
                        <Avatar
                            initials={dm.avatar}
                            imageUrl={avatarUrl}
                            seed={dm.address}
                            tone={dm.kind === "group" ? "sec" : undefined}
                            size="sm"
                            status={dm.kind === "dm" ? presenceToUserStatus(presence) : undefined}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="title truncate text-[14px] font-semibold text-foreground">{dm.displayName}</span>
                            {subline && (
                                <span
                                    className={cn(
                                        "truncate text-muted-foreground",
                                        sublineIsFact ? "font-mono text-[10px] tracking-[0.03em]" : "text-[11px]",
                                    )}
                                >
                                    {subline}
                                </span>
                            )}
                        </span>
                        {unread > 0 && !isActive && <UnreadPill count={unread} />}
                    </Button>
                )}
            >
                {(close) =>
                    dm.kind === "group" ? (
                        <GroupContextMenu
                            displayName={dm.displayName}
                            isMuted={isMuted}
                            onToggleMute={toggleMute}
                            onClose={close}
                        />
                    ) : (
                        <UserContextMenu
                            displayName={dm.displayName}
                            onClose={close}
                            isFriend={isFriend}
                            isMuted={isMuted}
                            onToggleMute={toggleMute}
                            onRemove={() => setIsConfirmingRemove(true)}
                            isBlocked={peerBlocked}
                            onBlock={() => setIsConfirmingBlock(true)}
                            onUnblock={() => peerActorUri && void unblock(peerActorUri, dm.displayName)}
                        />
                    )
                }
            </ContextMenu>
            <RemoveFriendModal
                friendName={isConfirmingRemove ? dm.displayName : null}
                isPending={isRemoving}
                onCancel={() => setIsConfirmingRemove(false)}
                onConfirm={handleConfirmRemove}
            />
            <BlockUserModal
                name={isConfirmingBlock ? dm.displayName : null}
                isPending={isBlocking}
                onCancel={() => setIsConfirmingBlock(false)}
                onConfirm={handleConfirmBlock}
            />
        </>
    )
}
