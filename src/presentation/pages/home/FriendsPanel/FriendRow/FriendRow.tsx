import { UserMinus } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { cn } from "@/presentation/_libs/utils"
import { userStatusLabel } from "@/domain/models/presence"
import type { Friend } from "../FriendsPanel.viewmodel"

interface FriendRowProps {
    friend: Friend
    /** True while this row's context menu is open. */
    isActive?: boolean
    onOpen: (address: string) => void
    onRemove: (friend: Friend) => void
}

export function FriendRow({ friend, isActive, onOpen, onRemove }: FriendRowProps) {
    const initials = friend.name
        .split(" ")
        .map((n) => n[0])
        .join("")

    return (
        <div
            onClick={() => onOpen(friend.address)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onOpen(friend.address)}
            className={cn(
                "group flex cursor-pointer items-center gap-4 rounded-md border-b border-border/40 px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "bg-accent/60" : "hover:bg-accent/40",
            )}
        >
            <Avatar
                initials={initials}
                imageUrl={friend.avatarUrl}
                size="md"
                status={friend.status}
                statusBorderClass="border-background"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="title text-[15px] font-medium text-foreground">{friend.name}</span>
                    <span className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
                        {friend.address}
                    </span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
                    <span className={cn("mr-1", `text-${friend.status === "online" ? "success" : friend.status === "idle" ? "warning" : "muted-foreground"}`)}>●</span>
                    {userStatusLabel(friend.status)}
                </p>
            </div>
            <button
                aria-label={`Remove ${friend.name}`}
                onClick={(e) => {
                    e.stopPropagation()
                    onRemove(friend)
                }}
                className="cursor-pointer rounded-md p-2 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            >
                <UserMinus className="h-4 w-4" />
            </button>
        </div>
    )
}
