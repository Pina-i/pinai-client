import { AtSign, Hash, HelpCircle, Inbox, Pin, Search, Users, X } from "lucide-react"
import { useAppStore } from "@/store/store"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { cn } from "@/presentation/_libs/utils"

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
    } = useAppStore()

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

                <Tooltip content="Inbox" placement="bottom" delay={300}>
                    <IconButton aria-label="Inbox" className="p-1 text-muted-foreground hover:text-foreground">
                        <Inbox className="h-5 w-5" />
                    </IconButton>
                </Tooltip>
                <Tooltip content="Help" placement="bottom" delay={300}>
                    <IconButton aria-label="Help" className="p-1 text-muted-foreground hover:text-foreground">
                        <HelpCircle className="h-5 w-5" />
                    </IconButton>
                </Tooltip>
            </div>
        </header>
    )
}
