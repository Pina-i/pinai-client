import { Bell } from "lucide-react"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getSocialPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Popover } from "@/presentation/molecules/Popover/Popover"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { cn } from "@/presentation/_libs/utils"
import type { WsNotification, WsNotificationEventType } from "@/domain/models/ws"

type FilterPill = "all" | "unread" | "mentions"

interface KindMeta {
    label: string
    color: string
}

const kindByEvent: Record<WsNotificationEventType, KindMeta> = {
    friend_request: { label: "FRIEND", color: "var(--chat)" },
    friend_accepted: { label: "FRIEND", color: "var(--chat)" },
    friend_removed: { label: "FRIEND", color: "var(--muted-foreground)" },
}

const sentenceByEvent: Record<WsNotificationEventType, string> = {
    friend_request: "sent you a friend request.",
    friend_accepted: "accepted your friend request.",
    friend_removed: "removed you as a friend.",
}

/** Stable hash → hue, gives every actor a predictable, distinct avatar tint. */
function colorFor(seed: string): string {
    let hash = 0
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
    const hue = Math.abs(hash) % 360
    return `oklch(0.74 0.07 ${hue})`
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

interface AvatarProps {
    name: string
    size: number
}

/** Initials avatar matching the design's NAvatar (serif initial on a tinted disk). */
function NotifAvatar({ name, size }: AvatarProps) {
    const initial = name.charAt(0).toUpperCase()
    return (
        <div
            className="title flex shrink-0 items-center justify-center rounded-full font-semibold"
            style={{
                width: size,
                height: size,
                background: colorFor(name),
                color: "oklch(0.18 0.008 60)",
                fontSize: size * 0.42,
            }}
        >
            {initial}
        </div>
    )
}

interface KindChipProps {
    label: string
    color: string
}

function KindChip({ label, color }: KindChipProps) {
    return (
        <span
            className="rounded-sm px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.1em]"
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
                "relative flex gap-[11px] rounded-sm px-2.5 py-2.5",
                isHighlighted && "bg-[color-mix(in_oklab,var(--chat)_8%,transparent)]",
            )}
        >
            {isUnread && (
                <span className="absolute left-[2px] top-[18px] h-[5px] w-[5px] rounded-full bg-chat" />
            )}
            <NotifAvatar name={notification.displayName} size={36} />
            <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                    <KindChip label={kind.label} color={kind.color} />
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {timeAgo(new Date(notification.receivedAt))}
                    </span>
                </div>
                <p className="text-[13px] leading-[1.4] text-foreground">
                    <span className="title font-medium">{notification.displayName}</span>{" "}
                    {sentence}
                </p>
                <p className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">
                    {notification.actorUri}
                </p>
                {isFriendRequest && (
                    <div className="mt-[9px] flex gap-1.5">
                        <Button
                            onPress={() => onAccept(notification)}
                            className="w-auto rounded-[5px] px-3 py-[5px] text-[11.5px] tracking-normal shadow-none"
                        >
                            Accept
                        </Button>
                        <Button
                            variant="secondary"
                            onPress={() => onReject(notification)}
                            className="w-auto rounded-[5px] border-border-strong px-2.5 py-[5px] text-[11.5px] text-muted-foreground hover:text-foreground"
                        >
                            Decline
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}

function EarlierRow({ notification }: { notification: WsNotification }) {
    const sentence = sentenceByEvent[notification.eventType]
    return (
        <div className="flex gap-[11px] rounded-sm px-2.5 py-2 opacity-85">
            <NotifAvatar name={notification.displayName} size={32} />
            <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-[1.4] text-foreground">
                    <span className="title font-medium">{notification.displayName}</span>{" "}
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
                    aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
                    className={cn(
                        "relative p-1",
                        isOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute right-[2px] top-[2px] h-[7px] w-[7px] rounded-full border-2 border-background bg-voice" />
                    )}
                </IconButton>
            }
            className="relative w-[400px] overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-popover shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.02)]"
        >
            {/* Caret */}
            <div className="pointer-events-none absolute -top-[7px] right-[14px] h-[14px] w-[14px] rotate-45 border-t border-l border-border-strong bg-popover" />

            {/* Header */}
            <div className="border-b border-border px-4 pt-[14px] pb-2.5">
                <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                        <h3 className="title text-[17px] font-medium text-foreground">Notifications</h3>
                        {unreadCount > 0 && (
                            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                {unreadCount} new
                            </span>
                        )}
                    </div>
                    {notifications.length > 0 && (
                        <button
                            type="button"
                            onClick={handleMarkAllRead}
                            className="rounded-[5px] bg-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors cursor-pointer hover:text-foreground"
                        >
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
                                    "rounded-full px-2.5 py-1 text-[11px] transition-colors cursor-pointer",
                                    active
                                        ? "border border-border-strong bg-accent font-medium text-foreground"
                                        : "border border-transparent text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Today */}
            {today.length > 0 && (
                <div className="px-2 pt-2">
                    <span className="block px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                        Today
                    </span>
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

            {/* Earlier this week */}
            {earlier.length > 0 && (
                <div className="px-2 pt-1 pb-1.5">
                    <span className="block px-2.5 pt-2 pb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                        Earlier this week
                    </span>
                    {earlier.map((n) => (
                        <EarlierRow key={n.id} notification={n} />
                    ))}
                </div>
            )}

            {!hasAny && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {filter === "all" ? "No notifications" : `No ${filter} notifications`}
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2.5 border-t border-border bg-[color-mix(in_oklab,var(--card)_60%,transparent)] px-3.5 py-2.5">
                <span className="flex-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    ↑↓ navigate · ↵ open
                </span>
            </div>
        </Popover>
    )
}
