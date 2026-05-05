import { ChevronDown, ChevronRight, Hash, Users, Volume2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "react-aria-components"
import { useAppStore } from "@/store/store"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { SearchField } from "@/presentation/atoms/SearchField/SearchField"
import { Menu, type MenuItemDescriptor } from "@/presentation/molecules/Menu/Menu"
import { cn } from "@/presentation/_libs/utils"
import { presenceToUserStatus, userStatusLabel } from "@/domain/models/presence"
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
    const dmUnread = useAppStore((s) => s.dmUnread)
    const presenceByAddress = useAppStore((s) => s.presenceByAddress)
    const avatarsByAddress = useAppStore((s) => s.avatarsByAddress)
    const switchToDms = useAppStore((s) => s.switchToDms)
    const navigate = useNavigate()

    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

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

    const serverMenuItems: MenuItemDescriptor[] = [
        { key: "invite", label: "Invite People" },
        { key: "settings", label: "Server Settings" },
        { key: "create", label: "Create Channel" },
        { key: "notifications", label: "Notification Settings" },
    ]

    return (
        <div className="flex w-60 shrink-0 flex-col border-r bg-card">
            {view === "server" ? (
                <>
                    {/* Server name header with dropdown */}
                    <Menu
                        trigger={
                            <Button
                                aria-label="Server menu"
                                className="group flex h-12 w-full items-center justify-between border-b border-border px-4 font-semibold text-foreground shadow-sm outline-none transition-colors hover:bg-accent cursor-pointer"
                            >
                                <span className="truncate">{activeServerData?.name}</span>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-aria-expanded:rotate-180" />
                            </Button>
                        }
                        items={serverMenuItems}
                        placement="bottom start"
                        offset={0}
                        popoverClassName="w-[calc(var(--trigger-width)-1rem)] ml-2"
                    />

                    {/* Channels grouped by category */}
                    <ScrollArea className="flex-1 px-2 py-3">
                        {categories.map((cat) => {
                            const isCollapsed = collapsedCategories.has(cat)
                            const catChannels = channels.filter((c) => c.category === cat)
                            return (
                                <div key={cat} className="mb-2">
                                    <Button
                                        onPress={() => toggleCategory(cat)}
                                        className="flex w-full items-center gap-0.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground outline-none transition-colors hover:text-foreground cursor-pointer"
                                    >
                                        {isCollapsed ? (
                                            <ChevronRight className="h-3 w-3" />
                                        ) : (
                                            <ChevronDown className="h-3 w-3" />
                                        )}
                                        {cat}
                                    </Button>
                                    {!isCollapsed &&
                                        catChannels.map((channel) => (
                                            <Button
                                                key={channel.id}
                                                onPress={() => selectChannel(channel.id)}
                                                className={cn(
                                                    "mt-0.5 flex w-full items-center gap-1.5 px-2 py-1.5 text-sm outline-none transition-colors cursor-pointer",
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
                                            </Button>
                                        ))}
                                </div>
                            )
                        })}
                    </ScrollArea>
                </>
            ) : (
                <>
                    {/* DM search header */}
                    <div className="flex h-14 items-center border-b border-border px-3">
                        <SearchField
                            aria-label="Find or start a conversation"
                            placeholder="Find or start a conversation"
                            shortcutHint="⌘K"
                            className="min-w-0 flex-1"
                        />
                    </div>

                    <ScrollArea className="flex-1 px-2 py-2">
                        {/* Friends button */}
                        <Button
                            onPress={() => {
                                switchToDms()
                                navigate({ to: "/home" })
                            }}
                            className={cn(
                                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors cursor-pointer",
                                activeDm === null
                                    ? "bg-chat/15 text-foreground"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                            )}
                        >
                            <Users className="h-4 w-4" />
                            Friends
                        </Button>

                        <div className="mb-1 mt-4 flex items-center justify-between px-2 mono-eyebrow">
                            <span>Direct Messages · {localDmConvos.length}</span>
                            <IconButton
                                aria-label="Start new direct message"
                                className="text-muted-foreground/60 hover:text-foreground"
                            >
                                ＋
                            </IconButton>
                        </div>

                        {localDmConvos.map((dm) => (
                            <Button
                                key={dm.id}
                                onPress={() => navigate({ to: "/dm/$name", params: { name: dm.address } })}
                                className={cn(
                                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 outline-none transition-colors cursor-pointer",
                                    activeDm === dm.id
                                        ? "bg-chat/15 text-foreground"
                                        : "hover:bg-accent/50",
                                )}
                            >
                                <Avatar
                                    initials={dm.avatar}
                                    imageUrl={dm.kind === "dm" ? avatarsByAddress[dm.address] ?? null : null}
                                    color={dm.color}
                                    size="sm"
                                    status={
                                        dm.kind === "dm"
                                            ? presenceToUserStatus(presenceByAddress[dm.address])
                                            : undefined
                                    }
                                    statusBorderClass="border-card"
                                />
                                <div className="min-w-0 flex-1 text-left">
                                    <p className="title truncate text-[13.5px] font-medium text-foreground">
                                        {dm.displayName}
                                    </p>
                                    {dm.kind === "dm" && (
                                        <p className="truncate font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
                                            {userStatusLabel(presenceToUserStatus(presenceByAddress[dm.address]))}
                                        </p>
                                    )}
                                </div>
                                {(dmUnread[dm.id] ?? 0) > 0 && (
                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-chat px-1.5 font-mono text-[10px] font-bold text-primary-foreground">
                                        {dmUnread[dm.id]}
                                    </span>
                                )}
                            </Button>
                        ))}
                    </ScrollArea>
                </>
            )}

            <UserPanel />
        </div>
    )
}
