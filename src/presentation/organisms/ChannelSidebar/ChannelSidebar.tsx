import { ChevronDown, ChevronRight, Hash, Search, Users, Volume2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAppStore } from "@/store/store"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { cn } from "@/presentation/_libs/utils"
import { UserPanel } from "./UserPanel"

export function ChannelSidebar() {
    const view = useAppStore((s) => s.view)
    const servers = useAppStore((s) => s.servers)
    const activeServer = useAppStore((s) => s.activeServer)
    const channelsByServer = useAppStore((s) => s.channelsByServer)
    const activeChannel = useAppStore((s) => s.activeChannel)
    const selectChannel = useAppStore((s) => s.selectChannel)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const activeDm = useAppStore((s) => s.activeDm)
    const switchToDms = useAppStore((s) => s.switchToDms)
    const navigate = useNavigate()

    const [showServerMenu, setShowServerMenu] = useState(false)
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
    const serverMenuRef = useRef<HTMLDivElement>(null)

    const activeServerData = servers.find((s) => s.id === activeServer)
    const channels = channelsByServer[activeServer] ?? []
    const categories = [...new Set(channels.map((c) => c.category))]

    function toggleCategory(cat: string) {
        setCollapsedCategories((prev) => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (serverMenuRef.current && !serverMenuRef.current.contains(e.target as Node)) {
                setShowServerMenu(false)
            }
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [])

    const serverMenuItems = ["Invite People", "Server Settings", "Create Channel", "Notification Settings"]

    return (
        <div className="flex w-60 shrink-0 flex-col border-r bg-card">
            {view === "server" ? (
                <>
                    {/* Server name header with dropdown */}
                    <div className="relative" ref={serverMenuRef}>
                        <button
                            onClick={() => setShowServerMenu((p) => !p)}
                            className="flex h-12 w-full items-center justify-between border-b border-border px-4 font-semibold text-foreground shadow-sm transition-colors hover:bg-accent"
                        >
                            <span className="truncate">{activeServerData?.name}</span>
                            <ChevronDown
                                className={cn("h-4 w-4 shrink-0 transition-transform", showServerMenu && "rotate-180")}
                            />
                        </button>
                        {showServerMenu && (
                            <div className="absolute left-2 right-2 top-12 z-50 border border-border bg-popover p-1.5 shadow-xl">
                                {serverMenuItems.map((label) => (
                                    <button
                                        key={label}
                                        onClick={() => setShowServerMenu(false)}
                                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Channels grouped by category */}
                    <ScrollArea className="flex-1 px-2 py-3">
                        {categories.map((cat) => {
                            const isCollapsed = collapsedCategories.has(cat)
                            const catChannels = channels.filter((c) => c.category === cat)
                            return (
                                <div key={cat} className="mb-2">
                                    <button
                                        onClick={() => toggleCategory(cat)}
                                        className="flex w-full items-center gap-0.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {isCollapsed ? (
                                            <ChevronRight className="h-3 w-3" />
                                        ) : (
                                            <ChevronDown className="h-3 w-3" />
                                        )}
                                        {cat}
                                    </button>
                                    {!isCollapsed &&
                                        catChannels.map((channel) => (
                                            <button
                                                key={channel.id}
                                                onClick={() => selectChannel(channel.id)}
                                                className={cn(
                                                    "mt-0.5 flex w-full items-center gap-1.5 px-2 py-1.5 text-sm transition-colors",
                                                    activeChannel === channel.id
                                                        ? "bg-accent text-foreground"
                                                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                                )}
                                            >
                                                {channel.type === "text" ? (
                                                    <Hash className="h-4 w-4 shrink-0 opacity-60" />
                                                ) : (
                                                    <Volume2 className="h-4 w-4 shrink-0 opacity-60" />
                                                )}
                                                <span className="flex-1 truncate text-left">{channel.name}</span>
                                                {channel.unread > 0 && (
                                                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                                        {channel.unread}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                </div>
                            )
                        })}
                    </ScrollArea>
                </>
            ) : (
                <>
                    {/* DM search header */}
                    <div className="flex h-12 items-center border-b border-border px-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Find or start a conversation"
                                className="h-7 w-full bg-sidebar pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                            />
                        </div>
                    </div>

                    <ScrollArea className="flex-1 px-2 py-2">
                        {/* Friends button */}
                        <button
                            onClick={() => {
                                switchToDms()
                                navigate({ to: "/home" })
                            }}
                            className={cn(
                                "flex w-full items-center gap-2 px-2 py-2 text-sm font-medium transition-colors",
                                activeDm === null
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                            )}
                        >
                            <Users className="h-5 w-5" />
                            Friends
                        </button>

                        <h3 className="mb-1 mt-4 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Direct Messages
                        </h3>

                        {localDmConvos.map((dm) => (
                            <button
                                key={dm.id}
                                onClick={() => navigate({ to: "/dm/$name", params: { name: dm.name } })}
                                className={cn(
                                    "flex w-full items-center gap-2 px-2 py-1.5 transition-colors",
                                    activeDm === dm.id
                                        ? "bg-accent text-foreground"
                                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                )}
                            >
                                <Avatar
                                    initials={dm.avatar}
                                    color={dm.color}
                                    size="sm"
                                    status={dm.status}
                                    statusBorderClass="border-card"
                                />
                                <span className="flex-1 truncate text-left text-sm">{dm.name}</span>
                                {dm.unread > 0 && (
                                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                        {dm.unread}
                                    </span>
                                )}
                            </button>
                        ))}
                    </ScrollArea>
                </>
            )}

            <UserPanel />
        </div>
    )
}
