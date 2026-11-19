import { useState } from "react"
import { cn } from "@/presentation/_libs/utils"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { Navbar } from "@/presentation/organisms/Navbar/Navbar"
import { findConversation } from "@pinai/domain/models/dm"
import { mayRenameGroup } from "@pinai/domain/models/group"
import { presenceToUserStatus } from "@pinai/domain/models/presence"
import { useOpenConversationRef } from "@/presentation/hooks/useOpenConversationRef"
import { useAppStore } from "@/store/store"
import { Hash, MessageSquare, Pencil, UserPlus, Users, Volume2 } from "lucide-react"
import { GroupTitleEditor } from "./GroupTitleEditor/GroupTitleEditor"

export function AppHeader() {
    const view = useAppStore((s) => s.view)
    const dmRef = useOpenConversationRef()
    const showMembers = useAppStore((s) => s.showMembers)
    const setShowMembers = useAppStore((s) => s.setShowMembers)
    const openGroupComposer = useAppStore((s) => s.openGroupComposer)
    // Select the one channel / conversation / presence the header shows, not
    // the maps: presence and avatar updates for everyone else must not re-render it.
    const currentChannel = useAppStore((s) =>
        (s.channelsByServer[s.activeServer] ?? []).find((c) => c.id === s.activeChannel),
    )
    const activeDmData = useAppStore((s) => (dmRef ? findConversation(s.localDmConvos, dmRef) : undefined))
    const activeDmPresence = useAppStore((s) =>
        activeDmData?.kind === "dm" ? s.presenceByAddress[activeDmData.address] : undefined,
    )
    const activeDmAvatarUrl = useAppStore((s) =>
        activeDmData?.kind === "dm" ? s.avatarsByAddress[activeDmData.address] ?? null : null,
    )

    const activeDmAddress = activeDmData?.address ?? dmRef ?? ""
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const renamable = view === "dms" && activeDmData && mayRenameGroup(activeDmData) ? activeDmData : null
    // Opening another conversation drops the edit, rather than keeping it for the way back.
    if (renamingId !== null && renamingId !== renamable?.id) setRenamingId(null)

    const title = view === "dms"
        ? (dmRef ? (activeDmData?.displayName ?? activeDmAddress.split("@")[0] ?? activeDmAddress) : "Friends")
        : (currentChannel?.name ?? "")

    const description = view === "dms"
        ? (dmRef
            ? (activeDmData?.kind === "group"
                ? (activeDmData.removedAt
                    ? "You're no longer a member"
                    : `${activeDmData.memberCount} ${activeDmData.memberCount === 1 ? "member" : "members"}`)
                : activeDmAddress)
            : "Manage your friends")
        : currentChannel?.description

    const dmStatus =
        view === "dms" && activeDmData?.kind === "dm"
            ? presenceToUserStatus(activeDmPresence)
            : undefined

    const isVoiceChannel = view === "server" && currentChannel?.type === "voice"

    const actions = (
        <>
            {view === "dms" && activeDmData?.kind === "dm" && (
                <Tooltip content="Add people" placement="bottom" delay={300}>
                    <IconButton
                        variant="ghost"
                        onPress={() =>
                            openGroupComposer({
                                prefillAddresses: [activeDmData.address],
                                fromDmId: activeDmData.id,
                            })
                        }
                        aria-label="Add people to start a group"
                    >
                        <UserPlus className="h-[18px] w-[18px]" />
                    </IconButton>
                </Tooltip>
            )}
            {view === "server" && (
                <Tooltip content="Member List" placement="bottom" delay={300}>
                    <IconButton
                        variant="ghost"
                        isActive={showMembers}
                        onPress={() => setShowMembers((p) => !p)}
                        aria-label="Toggle member list"
                    >
                        <Users className="h-[18px] w-[18px]" />
                    </IconButton>
                </Tooltip>
            )}
        </>
    )

    return (
        <Navbar actions={actions}>
            <span className="flex shrink-0">
                {view === "dms" && !dmRef ? (
                    <Users className="h-5 w-5" />
                ) : view === "dms" && activeDmData ? (
                    <Avatar
                        initials={activeDmData.avatar}
                        imageUrl={activeDmAvatarUrl}
                        seed={activeDmData.address}
                        tone={activeDmData.kind === "group" ? "sec" : undefined}
                        size="md"
                        status={dmStatus}
                    />
                ) : view === "dms" ? (
                    <MessageSquare className="h-5 w-5" />
                ) : isVoiceChannel ? (
                    <Volume2 className="h-5 w-5 text-sec" />
                ) : (
                    <Hash className="h-5 w-5" />
                )}
            </span>

            <div className="flex min-w-0 flex-1 flex-col">
                {renamable && renamingId === renamable.id ? (
                    <GroupTitleEditor
                        conversationId={renamable.id}
                        groupName={renamable.groupName}
                        placeholder={renamable.displayName}
                        onDone={() => setRenamingId(null)}
                    />
                ) : (
                    <span className="flex min-w-0 items-center gap-1">
                        <span className="title truncate text-[19px] font-semibold text-foreground">{title}</span>
                        {renamable && (
                            <Tooltip content="Rename group" placement="bottom" delay={300}>
                                <IconButton
                                    variant="ghost"
                                    aria-label="Rename group"
                                    onPress={() => setRenamingId(renamable.id)}
                                    className="h-[26px] w-[26px]"
                                >
                                    <Pencil className="h-[13px] w-[13px]" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </span>
                )}
                {description && (
                    <span
                        className={cn(
                            "truncate",
                            view === "dms" && dmRef ? "fact fact-plain" : "text-[11px] text-muted-foreground",
                        )}
                    >
                        {description}
                    </span>
                )}
            </div>
        </Navbar>
    )
}
