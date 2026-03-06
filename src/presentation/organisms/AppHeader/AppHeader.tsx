import { AtSign, Bell, Hash, HelpCircle, Pin, Search, Users, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useAppStore } from "@/store/store"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { cn } from "@/presentation/_libs/utils"

const notificationLabel: Record<string, string> = {
    follow_request: "sent you a friend request",
    follow_accepted: "accepted your friend request",
    follow_rejected: "declined your friend request",
    follow_removed: "removed you as a friend",
}

export function AppHeader() {
    const {
        view,
        activeServer,
        activeChannel,
        activeDm,
        channelsByServer,
        localDmConvos,
        showPinned,
        setShowPinned,
        showMembers,
        setShowMembers,
        searchQuery,
        setSearchQuery,
        notifications,
        clearNotifications,
    } = useAppStore()

    const [showNotifications, setShowNotifications] = useState(false)
    const [seenCount, setSeenCount] = useState(0)
    const panelRef = useRef<HTMLDivElement>(null)

    const unreadCount = notifications.length - seenCount

    // Close panel on outside click.
    useEffect(() => {
        if (!showNotifications) return
        function onClickOutside(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setShowNotifications(false)
            }
        }
        document.addEventListener("mousedown", onClickOutside)
        return () => document.removeEventListener("mousedown", onClickOutside)
    }, [showNotifications])

    function toggleNotifications() {
        setShowNotifications((prev) => {
            if (!prev) setSeenCount(notifications.length)
            return !prev
        })
    }

    const currentChannel = (channelsByServer[activeServer] ?? []).find((c) => c.id === activeChannel)
    const activeDmData = localDmConvos.find((d) => d.id === activeDm)

    const title =
        view === "dms" ? (activeDm ? (activeDmData?.name ?? "Direct Messages") : "Friends") : (currentChannel?.name ?? "")

    const description =
        view === "dms"
            ? activeDm
                ? activeDmData?.status
                : "Manage your friends"
            : currentChannel?.description

    return (
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
                {view === "dms" && !activeDm ? (
                    <Users className="h-5 w-5 text-muted-foreground" />
                ) : view === "dms" ? (
                    <AtSign className="h-5 w-5 text-muted-foreground" />
                ) : (
                    <Hash className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="font-semibold text-foreground">{title}</span>
                {description && (
                    <>
                        <div className="mx-2 h-6 w-px bg-border" />
                        <span className="text-sm text-muted-foreground">{description}</span>
                    </>
                )}
            </div>

            <div className="flex items-center gap-2">
                {view === "server" && (
                    <>
                        <Tooltip content="Pinned Messages" placement="bottom" delay={300}>
                            <IconButton
                                onPress={() => setShowPinned((p) => !p)}
                                aria-label="Toggle pinned messages"
                                className={cn(
                                    "p-1",
                                    showPinned ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <Pin className="h-5 w-5" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip content="Member List" placement="bottom" delay={300}>
                            <IconButton
                                onPress={() => setShowMembers((p) => !p)}
                                aria-label="Toggle member list"
                                className={cn(
                                    "p-1",
                                    showMembers ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <Users className="h-5 w-5" />
                            </IconButton>
                        </Tooltip>
                    </>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-7 w-40 bg-sidebar pl-8 pr-6 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>

                <div className="relative" ref={panelRef}>
                    <Tooltip content="Notifications" placement="bottom" delay={300}>
                        <IconButton
                            onPress={toggleNotifications}
                            aria-label="Notifications"
                            className={cn(
                                "p-1",
                                showNotifications ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Bell className="h-5 w-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                </span>
                            )}
                        </IconButton>
                    </Tooltip>

                    {showNotifications && (
                        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                            <div className="flex items-center justify-between border-b border-border px-3 py-2">
                                <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                                {notifications.length > 0 && (
                                    <button
                                        onClick={() => { clearNotifications(); setSeenCount(0) }}
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>
                            <div className="max-h-72 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications</p>
                                ) : (
                                    notifications.map((n) => (
                                        <div key={n.id} className="flex items-start gap-3 border-b border-border/50 px-3 py-2.5 last:border-0 hover:bg-accent/30">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-foreground">
                                                {n.username.slice(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-foreground">
                                                    <span className="font-semibold">{n.username}</span>{" "}
                                                    {notificationLabel[n.eventType] ?? n.eventType}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{n.address}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <Tooltip content="Help" placement="bottom" delay={300}>
                    <IconButton aria-label="Help" className="p-1 text-muted-foreground hover:text-foreground">
                        <HelpCircle className="h-5 w-5" />
                    </IconButton>
                </Tooltip>
            </div>
        </header>
    )
}
