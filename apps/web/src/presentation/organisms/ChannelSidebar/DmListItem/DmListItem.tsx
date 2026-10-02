import { useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "react-aria-components"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { ContextMenu } from "@/presentation/molecules/ContextMenu/ContextMenu"
import { UserContextMenu } from "@/presentation/molecules/UserContextMenu/UserContextMenu"
import { RemoveFriendModal } from "@/presentation/molecules/RemoveFriendModal/RemoveFriendModal"
import { BlockUserModal } from "@/presentation/molecules/BlockUserModal/BlockUserModal"
import { RemoveGroupFromListModal } from "@/presentation/molecules/RemoveGroupFromListModal/RemoveGroupFromListModal"
import { PersonProfileModal } from "@/presentation/organisms/PersonProfileModal/PersonProfileModal"
import { useIsFriend, useRemoveFriend } from "@/presentation/hooks/useRemoveFriend"
import { useBlockUser, useBlocks } from "@/presentation/hooks/useBlocks"
import { useDismissGroup } from "@/presentation/hooks/useDismissGroup"
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

    const isRemoved = dm.removedAt != null
    const preview = dm.kind === "dm" ? lastMessagePreview(messages, myAddress) : null
    // A message preview is prose; a member count or presence label is a machine fact.
    const subline =
        dm.kind === "group"
            ? (isRemoved ? "no longer a member" : `${dm.memberCount} ${dm.memberCount === 1 ? "member" : "members"}`)
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
    const [isShowingProfile, setIsShowingProfile] = useState(false)
    const { dismiss, isPending: isDismissing } = useDismissGroup()
    const [isConfirmingDismiss, setIsConfirmingDismiss] = useState(false)

    function openConversation() {
        navigate({ to: "/dm/$name", params: { name: dm.id } })
    }

    async function handleConfirmRemove() {
        if (peerActorUri && (await removeFriend(peerActorUri, dm.displayName))) setIsConfirmingRemove(false)
    }

    async function handleConfirmBlock() {
        if (peerActorUri && (await block(peerActorUri, dm.displayName))) setIsConfirmingBlock(false)
    }

    async function handleConfirmDismiss() {
        if (await dismiss(dm.id)) setIsConfirmingDismiss(false)
    }

    return (
        <>
            {/* The mute toggle is the row's sibling: a button can't nest in the row's button. */}
            <div className="group/dm relative">
                <ContextMenu
                    trigger={(isOpen) => (
                        <Button
                            onPress={openConversation}
                            className={cn(
                                sidebarRowClass,
                                isActive ? sidebarRowOnClass : isOpen && sidebarRowHotClass,
                                isRemoved && "opacity-60",
                            )}
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
                                {isMuted && !isRemoved ? (
                                    <span className="flex items-center gap-[5px] truncate font-mono text-[10px] tracking-[0.03em] text-muted-foreground">
                                        <BellOff className="h-[11px] w-[11px] shrink-0" />
                                        Muted
                                    </span>
                                ) : (
                                    subline && (
                                        <span
                                            className={cn(
                                                "truncate text-muted-foreground",
                                                sublineIsFact ? "font-mono text-[10px] tracking-[0.03em]" : "text-[11px]",
                                            )}
                                        >
                                            {subline}
                                        </span>
                                    )
                                )}
                            </span>
                            {unread > 0 && !isActive && (
                                <UnreadPill
                                    count={unread}
                                    isMuted={isMuted}
                                    className="group-focus-within/dm:invisible group-hover/dm:invisible"
                                />
                            )}
                        </Button>
                    )}
                >
                    {(close) =>
                        dm.kind === "group" ? (
                            <GroupContextMenu
                                displayName={dm.displayName}
                                isMuted={isMuted}
                                onToggleMute={toggleMute}
                                onRemoveFromList={isRemoved ? () => setIsConfirmingDismiss(true) : undefined}
                                onClose={close}
                            />
                        ) : (
                            <UserContextMenu
                                displayName={dm.displayName}
                                onClose={close}
                                onProfile={() => setIsShowingProfile(true)}
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
                {!isRemoved && (
                <button
                    type="button"
                    title={isMuted ? "Unmute conversation" : "Mute conversation"}
                    aria-label={`${isMuted ? "Unmute" : "Mute"} ${dm.displayName}`}
                    onClick={toggleMute}
                    className="absolute right-2 top-1/2 hidden h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-surf3 hover:text-foreground focus-visible:flex focus-visible:ring-2 focus-visible:ring-ring group-focus-within/dm:flex group-hover/dm:flex"
                >
                    {isMuted ? <Bell className="h-[13px] w-[13px]" /> : <BellOff className="h-[13px] w-[13px]" />}
                </button>
                )}
            </div>
            <RemoveFriendModal
                friendName={isConfirmingRemove ? dm.displayName : null}
                isPending={isRemoving}
                onCancel={() => setIsConfirmingRemove(false)}
                onConfirm={handleConfirmRemove}
            />
            <PersonProfileModal
                person={
                    isShowingProfile && peerActorUri
                        ? { actorUri: peerActorUri, address: dm.address, displayName: dm.displayName, avatarUrl }
                        : null
                }
                onClose={() => setIsShowingProfile(false)}
                onMessage={() => {
                    setIsShowingProfile(false)
                    openConversation()
                }}
            />
            <RemoveGroupFromListModal
                groupName={isConfirmingDismiss ? dm.displayName : null}
                isPending={isDismissing}
                onCancel={() => setIsConfirmingDismiss(false)}
                onConfirm={handleConfirmDismiss}
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
