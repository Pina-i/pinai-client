import { useNavigate } from "@tanstack/react-router"
import { Button } from "react-aria-components"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { ContextMenu } from "@/presentation/molecules/ContextMenu/ContextMenu"
import { UserContextMenu } from "@/presentation/molecules/UserContextMenu/UserContextMenu"
import { GroupContextMenu } from "@/presentation/molecules/GroupContextMenu/GroupContextMenu"
import { cn } from "@/presentation/_libs/utils"
import { presenceToUserStatus, userStatusLabel } from "@pinai/domain/models/presence"
import { useAppStore } from "@/store/store"
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

    const preview = dm.kind === "dm" ? lastMessagePreview(messages, myAddress) : null
    // A message preview is prose; a member count or presence label is a machine fact.
    const subline =
        dm.kind === "group"
            ? `${dm.memberCount} ${dm.memberCount === 1 ? "member" : "members"}`
            : (preview ?? userStatusLabel(presenceToUserStatus(presence)).toLowerCase())
    const sublineIsFact = preview == null

    return (
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
                    <GroupContextMenu displayName={dm.displayName} onClose={close} />
                ) : (
                    <UserContextMenu displayName={dm.displayName} onClose={close} />
                )
            }
        </ContextMenu>
    )
}
