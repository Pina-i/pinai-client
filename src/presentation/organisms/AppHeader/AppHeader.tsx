import { cn } from "@/presentation/_libs/utils"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { ThemeSwitcher } from "@/presentation/molecules/ThemeSwitcher/ThemeSwitcher"
import { presenceToUserStatus } from "@/domain/models/presence"
import { useAppStore } from "@/store/store"
import { Hash, MessageSquare, Pin, UserPlus, Users } from "lucide-react"
import { NotificationsPopover } from "./NotificationsPopover/NotificationsPopover"

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
        showGroupMembers,
        setShowGroupMembers,
        openGroupComposer,
    } = useAppStore()

    const presenceByAddress = useAppStore((s) => s.presenceByAddress)
    const avatarsByAddress = useAppStore((s) => s.avatarsByAddress)

    const currentChannel = (channelsByServer[activeServer] ?? []).find((c) => c.id === activeChannel)
    const activeDmData = localDmConvos.find((d) => d.id === activeDm)
    const activeDmAddress = activeDmData?.address ?? activeDm ?? ""
    const activeDmAvatarUrl =
        activeDmData?.kind === "dm" ? avatarsByAddress[activeDmData.address] ?? null : null

    const title = view === "dms"
        ? (activeDm ? (activeDmData?.displayName ?? activeDmAddress.split("@")[0] ?? activeDmAddress) : "Friends")
        : (currentChannel?.name ?? "")

    const description = view === "dms"
        ? (activeDm ? activeDmAddress : "Manage your friends")
        : currentChannel?.description

    const dmStatus =
        view === "dms" && activeDmData?.kind === "dm"
            ? presenceToUserStatus(presenceByAddress[activeDmData.address])
            : undefined

    return (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
            <div className="flex items-center gap-3">
                {view === "dms" && !activeDm ? (
                    <Users className="h-5 w-5 text-muted-foreground" />
                ) : view === "dms" && activeDmData ? (
                    <Avatar
                        initials={activeDmData.avatar}
                        imageUrl={activeDmAvatarUrl}
                        color={activeDmData.color}
                        size="md"
                        status={dmStatus}
                        statusBorderClass="border-background"
                    />
                ) : view === "dms" ? (
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                ) : (
                    <Hash className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="flex flex-col">
                    <span className="title text-[17px] font-medium leading-tight text-foreground">
                        {title}
                    </span>
                    {description && (
                        <span className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                            {description}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2">
                {view === "dms" && activeDmData?.kind === "group" && (
                    <Tooltip content="Members" placement="bottom" delay={300}>
                        <IconButton
                            onPress={() => setShowGroupMembers((p) => !p)}
                            aria-label="Toggle members"
                            className={cn("p-1", showGroupMembers ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            <Users className="h-5 w-5" />
                        </IconButton>
                    </Tooltip>
                )}
                {view === "dms" && activeDmData?.kind === "dm" && (
                    <Tooltip content="Add people" placement="bottom" delay={300}>
                        <IconButton
                            onPress={() =>
                                openGroupComposer({
                                    prefillAddresses: [activeDmData.address],
                                    fromDmId: activeDmData.id,
                                })
                            }
                            aria-label="Add people to start a group"
                            className="p-1 text-muted-foreground hover:text-foreground"
                        >
                            <UserPlus className="h-5 w-5" />
                        </IconButton>
                    </Tooltip>
                )}
                {view === "server" && (
                    <>
                        <Tooltip
                            content="Pinned Messages"
                            placement="bottom"
                            delay={300}
                        >
                            <IconButton
                                onPress={() => setShowPinned((p) => !p)}
                                aria-label="Toggle pinned messages"
                                className={cn("p-1", showPinned ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                            >
                                <Pin className="h-5 w-5" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip
                            content="Member List"
                            placement="bottom"
                            delay={300}
                        >
                            <IconButton
                                onPress={() => setShowMembers((p) => !p)}
                                aria-label="Toggle member list"
                                className={cn("p-1", showMembers ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                            >
                                <Users className="h-5 w-5" />
                            </IconButton>
                        </Tooltip>
                    </>
                )}

                <ThemeSwitcher />

                <NotificationsPopover />
            </div>
        </header>
    )
}
