import { Bell } from "lucide-react"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getSocialPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Popover, PopoverCaret } from "@/presentation/molecules/Popover/Popover"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { cn } from "@/presentation/_libs/utils"
import { actorUriToAddress } from "@pinai/domain/models/identity"
import type { WsNotification, WsNotificationEventType } from "@pinai/domain/models/ws"

type FilterPill = "all" | "unread" | "mentions"

interface KindMeta {
    label: string
    color: string
}

const kindByEvent: Record<WsNotificationEventType, KindMeta> = {
    friend_request: { label: "Friend", color: "var(--acc)" },
    friend_accepted: { label: "Friend", color: "var(--acc)" },
}

const sentenceByEvent: Record<WsNotificationEventType, string> = {
    friend_request: "sent you a friend request.",
    friend_accepted: "accepted your friend request.",
}

function timeAgo(date: Date): string {
    const diff = (Date.now() - date.getTime()) / 1000
    if (diff < 5) return "just now"
    if (diff < 60) return `${Math.floor(diff)}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
}

function formatEarlier(date: Date): string {
    const day = date.toLocaleDateString(undefined, { weekday: "short" })
    const time = date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    })
    return `${day} · ${time}`
}

function isToday(date: Date): boolean {
    const now = new Date()
    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    )
}

function isThisWeek(date: Date): boolean {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return date >= sevenDaysAgo
}

function NotifAvatar({ notification, size }: { notification: WsNotification; size: "sm" | "md" }) {
    return (
        <Avatar
            initials={notification.displayName.slice(0, 2).toUpperCase()}
            seed={actorUriToAddress(notification.actorUri)}
            size={size}
        />
    )
}

const pillButtonClass =
    "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-[13px] py-1.5 text-[11.5px] outline-none transition-[opacity,background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-ring"

const popLinkClass =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent bg-transparent px-2.5 py-[5px] text-[11.5px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-surf2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

interface KindChipProps {
    label: string
    color: string
}

function KindChip({ label, color }: KindChipProps) {
    return (
        <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]"
            style={{
                color,
                background: `color-mix(in oklab, ${color} 14%, transparent)`,
            }}
        >
            {label}
        </span>
    )
}

interface NotificationRowProps {
    notification: WsNotification
    isUnread: boolean
    onAccept: (notification: WsNotification) => void
    onReject: (notification: WsNotification) => void
}

function TodayRow({ notification, isUnread, onAccept, onReject }: NotificationRowProps) {
    const kind = kindByEvent[notification.eventType]
    const sentence = sentenceByEvent[notification.eventType]
    const isFriendRequest = notification.eventType === "friend_request" && notification.friendshipId
    const isHighlighted = isUnread && notification.eventType === "friend_request"

    return (
        <div
            className={cn(
                "relative flex gap-[11px] rounded-[14px] px-3 py-2.5",
                isHighlighted && "bg-[color-mix(in_oklab,var(--acc)_9%,transparent)]",
            )}
        >
            {isUnread && <span className="absolute left-[3px] top-[22px] h-[5px] w-[5px] rounded-full bg-acc" />}
            <NotifAvatar notification={notification} size="md" />
            <div className="min-w-0 flex-1">
                <div className="mb-[3px] flex items-center gap-1.5">
                    <KindChip label={kind.label} color={kind.color} />
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {timeAgo(new Date(notification.receivedAt))}
                    </span>
                </div>
                <p className="text-[13px] leading-[1.4] text-foreground">
                    <span className="title text-[14px] font-semibold">{notification.displayName}</span>{" "}
                    {sentence}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{notification.actorUri}</p>
                {isFriendRequest && (
                    <div className="mt-[9px] flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => onAccept(notification)}
                            className={cn(pillButtonClass, "border-transparent bg-action font-bold text-action-foreground hover:opacity-90")}
                        >
                            Accept
                        </button>
                        <button
                            type="button"
                            onClick={() => onReject(notification)}
                            className={cn(pillButtonClass, "border-line2 bg-transparent text-muted-foreground hover:bg-surf2 hover:text-foreground")}
                        >
                            Decline
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

function EarlierRow({ notification }: { notification: WsNotification }) {
    const sentence = sentenceByEvent[notification.eventType]
    return (
        <div className="flex gap-[11px] rounded-[14px] px-3 py-2 opacity-85">
            <NotifAvatar notification={notification} size="sm" />
            <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-[1.4] text-foreground">
                    <span className="title text-[14px] font-semibold">{notification.displayName}</span>{" "}
                    {sentence}
                </p>
                <span className="font-mono text-[10px] text-muted-foreground">
                    {formatEarlier(new Date(notification.receivedAt))}
                </span>
            </div>
        </div>
    )
}

export function NotificationsPopover() {
    const notifications = useAppStore((s) => s.notifications)
    const dismissNotification = useAppStore((s) => s.dismissNotification)
    const clearNotifications = useAppStore((s) => s.clearNotifications)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const queryClient = useQueryClient()

    const [seenCount, setSeenCount] = useState(0)
    const [unreadInPanel, setUnreadInPanel] = useState<Set<string>>(new Set())
    const [filter, setFilter] = useState<FilterPill>("all")
    const [isOpen, setIsOpen] = useState(false)

    const unreadCount = Math.max(0, notifications.length - seenCount)

    function handleOpenChange(open: boolean) {
        if (open) {
            // Snapshot unread ids BEFORE updating seenCount, so the in-panel
            // dot/highlight survives even after the bell badge clears.
            const cutoff = Math.max(0, notifications.length - seenCount)
            const ids = new Set(notifications.slice(0, cutoff).map((n) => n.id))
            setUnreadInPanel(ids)
            setSeenCount(notifications.length)
        }
        setIsOpen(open)
    }

    async function handleAccept(n: WsNotification) {
        if (!accessToken || !idpUrl || !n.friendshipId) return
        try {
            await getSocialPort().acceptFriendRequest(idpUrl, accessToken, n.friendshipId)
            dismissNotification(n.id)
            toast.success("Friend request accepted")
            queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong")
        }
    }

    async function handleReject(n: WsNotification) {
        if (!accessToken || !idpUrl || !n.friendshipId) return
        try {
            await getSocialPort().rejectFriendRequest(idpUrl, accessToken, n.friendshipId)
            dismissNotification(n.id)
            toast.success("Friend request declined")
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong")
        }
    }

    function handleMarkAllRead() {
        clearNotifications()
        setSeenCount(0)
        setUnreadInPanel(new Set())
    }

    const filtered = notifications.filter((n) => {
        if (filter === "unread") return unreadInPanel.has(n.id)
        if (filter === "mentions") return false
        return true
    })

    const today = filtered.filter((n) => isToday(new Date(n.receivedAt)))
    const earlier = filtered.filter((n) => {
        const d = new Date(n.receivedAt)
        return !isToday(d) && isThisWeek(d)
    })

    const hasAny = today.length > 0 || earlier.length > 0

    return (
        <Popover
            isOpen={isOpen}
            onOpenChange={handleOpenChange}
            placement="bottom end"
            offset={12}
            trigger={
                <IconButton
                    variant="ghost"
                    isActive={isOpen}
                    aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
                    className={cn("relative h-[34px] w-[34px]", isOpen && "bg-surf3")}
                >
                    <Bell className="h-[18px] w-[18px]" />
                    {unreadCount > 0 && (
                        <span className="absolute right-1 top-1 h-2 w-2 rounded-full border-2 border-background bg-sec" />
                    )}
                </IconButton>
            }
            className={cn(popoverSurface, "relative w-[400px]")}
        >
            <PopoverCaret side="up" className="right-2.5" />

            <div className="relative overflow-hidden rounded-[17px]">
                <div className="border-b border-line px-4 pb-2.5 pt-3.5">
                    <div className="flex items-baseline justify-between gap-2.5">
                        <div className="flex items-baseline gap-2">
                            <h3 className="title text-[18px] font-normal tracking-[-0.005em] text-foreground">Notifications</h3>
                            {unreadInPanel.size > 0 && <span className="fact">{unreadInPanel.size} new</span>}
                        </div>
                        {notifications.length > 0 && (
                            <button type="button" onClick={handleMarkAllRead} className={popLinkClass}>
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="mt-2.5 flex gap-1">
                        {(["all", "unread", "mentions"] as const).map((pill) => {
                            const active = filter === pill
                            const label = pill === "all" ? "All" : pill === "unread" ? "Unread" : "Mentions"
                            return (
                                <button
                                    key={pill}
                                    type="button"
                                    onClick={() => setFilter(pill)}
                                    className={cn(
                                        "cursor-pointer rounded-full border px-3 py-[5px] text-[11.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                                        active
                                            ? "border-line2 bg-surf2 font-medium text-foreground"
                                            : "border-transparent text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {today.length > 0 && (
                    <div className="px-2 pt-2">
                        <p className="eye px-3 py-1.5">Today</p>
                        {today.map((n) => (
                            <TodayRow
                                key={n.id}
                                notification={n}
                                isUnread={unreadInPanel.has(n.id)}
                                onAccept={handleAccept}
                                onReject={handleReject}
                            />
                        ))}
                    </div>
                )}

                {earlier.length > 0 && (
                    <div className="px-2 pb-1.5 pt-1">
                        <p className="eye px-3 pb-1 pt-2">Earlier this week</p>
                        {earlier.map((n) => (
                            <EarlierRow key={n.id} notification={n} />
                        ))}
                    </div>
                )}

                {!hasAny && (
                    <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                        {filter === "all" ? "No notifications" : `No ${filter} notifications`}
                    </p>
                )}

                <div className="flex items-center gap-2 border-t border-line bg-surf px-3.5 py-[9px]">
                    <span className="fact flex-1">↑↓ navigate · ↵ open</span>
                </div>
            </div>
        </Popover>
    )
}
