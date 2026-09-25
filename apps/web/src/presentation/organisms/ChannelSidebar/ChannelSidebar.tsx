import { ChevronDown, Hash, Plus, Users, Volume2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "react-aria-components"
import { useAppStore } from "@/store/store"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Motif } from "@/presentation/atoms/motif/motif"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { SearchField } from "@/presentation/atoms/SearchField/SearchField"
import { Menu, type MenuItemDescriptor } from "@/presentation/molecules/Menu/Menu"
import { cn } from "@/presentation/_libs/utils"
import { UserPanel } from "./UserPanel"
import { DmListItem } from "./DmListItem/DmListItem"
import { UnreadPill } from "./UnreadPill/UnreadPill"
import { sidebarRowClass, sidebarRowOnClass } from "./sidebar-row.styles"

export function ChannelSidebar() {
    const view = useAppStore((s) => s.view)
    const servers = useAppStore((s) => s.servers)
    const activeServer = useAppStore((s) => s.activeServer)
    const channelsByServer = useAppStore((s) => s.channelsByServer)
    const activeChannel = useAppStore((s) => s.activeChannel)
    const selectChannel = useAppStore((s) => s.selectChannel)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const activeDm = useAppStore((s) => s.activeDm)
    const openGroupComposer = useAppStore((s) => s.openGroupComposer)
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
        <aside className="relative z-[2] my-3 flex w-[236px] shrink-0 flex-col overflow-hidden rounded-[22px] border border-line bg-surf backdrop-blur-[14px]">
            <Motif
                variant="field"
                className="absolute inset-0 rounded-[22px]"
                style={{ opacity: "var(--motif-opacity)" }}
            />

            {view === "server" ? (
                <>
                    <Menu
                        trigger={
                            <Button
                                aria-label="Server menu"
                                className="group relative flex w-full cursor-pointer items-center justify-between gap-2 border-b border-line p-3 text-left text-foreground outline-none transition-colors duration-150 hover:bg-surf aria-expanded:bg-surf"
                            >
                                <span className="title truncate text-[16px] font-semibold">{activeServerData?.name}</span>
                                <ChevronDown className="h-[15px] w-[15px] shrink-0 transition-transform duration-200 group-aria-expanded:rotate-180" />
                            </Button>
                        }
                        items={serverMenuItems}
                        placement="bottom start"
                        offset={0}
                        popoverClassName="ml-2 w-[calc(var(--trigger-width)-1rem)] rounded-[14px]"
                    />

                    <ScrollArea className="relative flex-1 px-2.5 py-0.5">
                        {categories.map((cat) => {
                            const isCollapsed = collapsedCategories.has(cat)
                            const catChannels = channels.filter((c) => c.category === cat)
                            return (
                                <div key={cat} className="mb-2.5">
                                    <Button
                                        onPress={() => toggleCategory(cat)}
                                        aria-expanded={!isCollapsed}
                                        className="eye mb-[7px] mt-2 block cursor-pointer pl-2 text-left outline-none transition-colors hover:text-foreground"
                                    >
                                        {cat}
                                    </Button>
                                    {!isCollapsed &&
                                        catChannels.map((channel) => {
                                            const isVoice = channel.type === "voice"
                                            const isOn = activeChannel === channel.id
                                            return (
                                                <Button
                                                    key={channel.id}
                                                    onPress={() => selectChannel(channel.id)}
                                                    className={cn(
                                                        sidebarRowClass,
                                                        isOn &&
                                                            (isVoice
                                                                ? "bg-sec-soft text-foreground shadow-[inset_0_0_0_1px_var(--secline)] hover:bg-sec-soft"
                                                                : sidebarRowOnClass),
                                                    )}
                                                >
                                                    {isVoice ? (
                                                        <Volume2 className="h-4 w-4 shrink-0 text-sec" />
                                                    ) : (
                                                        <Hash className="h-4 w-4 shrink-0" />
                                                    )}
                                                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{channel.name}</span>
                                                    {channel.unread > 0 && <UnreadPill count={channel.unread} />}
                                                </Button>
                                            )
                                        })}
                                </div>
                            )
                        })}
                    </ScrollArea>
                </>
            ) : (
                <>
                    <div className="relative p-3">
                        <SearchField
                            aria-label="Find or start a conversation"
                            placeholder="Find or start a conversation"
                            shortcutHint="⌘K"
                        />
                    </div>

                    <ScrollArea className="relative flex-1 px-2.5 py-0.5">
                        <Button
                            onPress={() => {
                                switchToDms()
                                navigate({ to: "/home" })
                            }}
                            className={cn(sidebarRowClass, "text-[13.5px]", activeDm === null && sidebarRowOnClass)}
                        >
                            <Users className="h-4 w-4 shrink-0" />
                            Friends
                        </Button>

                        <div className="mb-[7px] mt-4 flex items-center justify-between pl-2">
                            <p className="eye">Direct Messages</p>
                            <IconButton
                                variant="ghost"
                                aria-label="New group"
                                onPress={() => openGroupComposer()}
                                className="relative h-[26px] w-[26px]"
                            >
                                <Users className="h-4 w-4" />
                                <span className="absolute bottom-px right-px flex h-3 w-3 items-center justify-center rounded-full bg-acc text-acc-ink shadow-[0_0_0_2px_var(--background)]">
                                    <Plus className="h-2 w-2" strokeWidth={3} />
                                </span>
                            </IconButton>
                        </div>

                        {localDmConvos.map((dm) => (
                            <DmListItem key={dm.id} dm={dm} />
                        ))}
                    </ScrollArea>
                </>
            )}

            <UserPanel />
        </aside>
    )
}
