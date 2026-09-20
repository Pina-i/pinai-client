import { useNavigate } from "@tanstack/react-router"
import { Button } from "react-aria-components"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { ContextMenu } from "@/presentation/molecules/ContextMenu/ContextMenu"
import { UserContextMenu } from "@/presentation/molecules/UserContextMenu/UserContextMenu"
import { GroupContextMenu } from "@/presentation/molecules/GroupContextMenu/GroupContextMenu"
import { cn } from "@/presentation/_libs/utils"
import { presenceToUserStatus, userStatusLabel } from "@/domain/models/presence"
import { useAppStore } from "@/store/store"
import type { DmConversation } from "@/lib/types"
import { lastMessagePreview } from "../_helpers/last-message-preview.helper"

export function DmListItem({ dm }: { dm: DmConversation }) {
    const navigate = useNavigate()
    // Narrow selectors so only the affected row re-renders, not the whole list.
    const isActive = useAppStore((s) => s.activeDm === dm.id)
    const unread = useAppStore((s) => s.dmUnread[dm.id] ?? 0)
    const presence = useAppStore((s) => s.presenceByAddress[dm.address])
    const avatarUrl = useAppStore((s) => (dm.kind === "dm" ? s.avatarsByAddress[dm.address] ?? null : null))
    const messages = useAppStore((s) => s.dmMessages[dm.id])
    const myAddress = useAppStore((s) => s.user?.address)

    const subline =
        dm.kind === "group"
            ? `${dm.memberCount} ${dm.memberCount === 1 ? "member" : "members"}`
            : (lastMessagePreview(messages, myAddress) ?? userStatusLabel(presenceToUserStatus(presence)))

    return (
        <ContextMenu
            trigger={(isOpen) => (
                <Button
                    onPress={() => navigate({ to: "/dm/$name", params: { name: dm.id } })}
                    className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 outline-none transition-colors cursor-pointer",
                        isActive && "bg-chat/15 text-foreground",
                        !isActive && (isOpen ? "bg-accent/60" : "hover:bg-accent/50"),
                    )}
                >
                    <Avatar
                        initials={dm.avatar}
                        imageUrl={avatarUrl}
                        color={dm.color}
                        size="sm"
                        status={dm.kind === "dm" ? presenceToUserStatus(presence) : undefined}
                        statusBorderClass="border-card"
                    />
                    <div className="min-w-0 flex-1 text-left">
                        <p className="title truncate text-[13.5px] font-medium text-foreground">{dm.displayName}</p>
                        {subline && (
                            <p className="truncate font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
                                {subline}
                            </p>
                        )}
                    </div>
                    {unread > 0 && !isActive && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-chat px-1.5 font-mono text-[10px] font-bold text-primary-foreground">
                            {unread}
                        </span>
                    )}
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
