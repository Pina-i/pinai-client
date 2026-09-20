import { useState } from "react"
import { Crown, Globe, LogOut, MessageSquare, MoreHorizontal, User, UserMinus, UserPlus, Video } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { ContextMenuTrigger } from "@/presentation/molecules/ContextMenu/ContextMenuTrigger"
import type { ContextMenuItem } from "@/presentation/molecules/ContextMenu/ContextMenuList"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { cn } from "@/presentation/_libs/utils"
import { actorUriToAddress } from "@/domain/models/identity"
import { presenceToUserStatus } from "@/domain/models/presence"
import { useAppStore } from "@/store/store"
import type { GroupMember } from "@/domain/models/group"
import { useGroupMembersPanelViewModel } from "./GroupMembersPanel.viewmodel"

export function GroupMembersPanel({ conversationId }: { conversationId: string }) {
    return <GroupMembersPanelContent conversationId={conversationId} />
}

function memberInitials(member: GroupMember): string {
    return (member.displayName ?? "?")
        .split(" ")
        .map((n) => n[0])
        .join("")
}

function GroupMembersPanelContent({ conversationId }: { conversationId: string }) {
    const vm = useGroupMembersPanelViewModel(conversationId)
    const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null)

    return (
        <aside className="flex w-[284px] shrink-0 flex-col border-l border-border bg-background">
            <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-baseline gap-2">
                    <h3 className="title text-base font-medium text-foreground">Members</h3>
                    <span className="font-mono text-[10.5px] text-muted-foreground">{vm.members.length}</span>
                </div>
                {vm.isAdmin && (
                    <IconButton
                        aria-label="Add people"
                        onPress={vm.openAddPeople}
                        className="h-[30px] w-[30px] rounded-md border border-border text-chat transition-colors hover:bg-chat/10"
                    >
                        <UserPlus className="h-4 w-4" />
                    </IconButton>
                )}
            </div>

            <ScrollArea className="flex-1 px-2 py-2">
                {vm.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
                {vm.error && <p className="py-8 text-center text-sm text-destructive">{vm.error}</p>}

                {vm.admins.length > 0 && (
                    <>
                        <p className="px-3 pb-1.5 pt-2 mono-eyebrow">Admin</p>
                        {vm.admins.map((member) => (
                            <RosterRow
                                key={member.actorUri}
                                member={member}
                                isSelf={member.actorUri === vm.myActorUri}
                                viewerIsAdmin={vm.isAdmin}
                                pending={vm.pendingActor === member.actorUri}
                                localHost={vm.localHost}
                                onSetRole={vm.setRole}
                                onRemove={() => setRemoveTarget(member)}
                            />
                        ))}
                    </>
                )}

                {vm.regularMembers.length > 0 && (
                    <>
                        <p className="px-3 pb-1.5 pt-3 mono-eyebrow">Members</p>
                        {vm.regularMembers.map((member) => (
                            <RosterRow
                                key={member.actorUri}
                                member={member}
                                isSelf={member.actorUri === vm.myActorUri}
                                viewerIsAdmin={vm.isAdmin}
                                pending={vm.pendingActor === member.actorUri}
                                localHost={vm.localHost}
                                onSetRole={vm.setRole}
                                onRemove={() => setRemoveTarget(member)}
                            />
                        ))}
                    </>
                )}
            </ScrollArea>

            <div className="border-t border-border px-4 py-3">
                <button
                    onClick={vm.leaveGroup}
                    className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-border py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                    <LogOut className="h-4 w-4" /> Leave group
                </button>
            </div>

            <Modal isOpen={removeTarget !== null} onClose={() => setRemoveTarget(null)} label="Remove member">
                {removeTarget && (
                    <div className="w-[400px] max-w-[92vw] rounded-[var(--radius-lg)] border border-border-strong bg-popover p-6 text-center shadow-xl">
                        <div className="mx-auto mb-3 w-fit">
                            <Avatar initials={memberInitials(removeTarget)} imageUrl={removeTarget.avatarUrl} size="lg" />
                        </div>
                        <h3 className="title text-lg font-medium text-foreground">
                            Remove {removeTarget.displayName ?? "this member"}?
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            They'll be removed from the group and won't see new messages. Earlier messages stay with
                            the group.
                        </p>
                        <div className="mt-6 flex justify-center gap-2">
                            <Button variant="secondary" onPress={() => setRemoveTarget(null)} className="w-auto px-4">
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onPress={() => {
                                    void vm.removeMember(removeTarget.actorUri)
                                    setRemoveTarget(null)
                                }}
                                className="w-auto px-4"
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </aside>
    )
}

function MemberServerTag({ host, federated }: { host: string; federated: boolean }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[9px] tracking-[0.04em]",
                federated ? "border-chat/30 bg-chat/10 text-chat" : "border-border text-muted-foreground",
            )}
        >
            {federated && <Globe className="h-2.5 w-2.5" />}
            {host}
        </span>
    )
}

function RosterRow({
    member,
    isSelf,
    viewerIsAdmin,
    pending,
    localHost,
    onSetRole,
    onRemove,
}: {
    member: GroupMember
    isSelf: boolean
    viewerIsAdmin: boolean
    pending: boolean
    localHost: string | null
    onSetRole: (actorUri: string, role: "admin" | "member") => void
    onRemove: () => void
}) {
    const address = actorUriToAddress(member.actorUri)
    const host = address.split("@")[1] ?? ""
    const federated = !!localHost && !!host && host !== localHost
    const presence = useAppStore((s) => s.presenceByAddress[address])

    // Comms actions (message/call/profile) aren't wired yet; admin actions are.
    const menuItems: ContextMenuItem[] = [
        { key: "message", label: "Message privately", icon: <MessageSquare className="h-4 w-4" /> },
        { key: "call", label: "Call", icon: <Video className="h-4 w-4" /> },
        { key: "profile", label: "See profile", icon: <User className="h-4 w-4" /> },
    ]
    if (viewerIsAdmin) {
        menuItems.push(
            { type: "separator", key: "sep-admin" },
            member.role === "admin"
                ? {
                      key: "demote",
                      label: "Remove admin",
                      icon: <Crown className="h-4 w-4" />,
                      onAction: () => onSetRole(member.actorUri, "member"),
                  }
                : {
                      key: "promote",
                      label: "Make admin",
                      icon: <Crown className="h-4 w-4" />,
                      onAction: () => onSetRole(member.actorUri, "admin"),
                  },
            {
                key: "remove",
                label: "Remove from group",
                icon: <UserMinus className="h-4 w-4" />,
                variant: "destructive",
                onAction: onRemove,
            },
        )
    }

    return (
        <div className={cn("flex items-center gap-3 rounded-md px-2.5 py-2", pending && "opacity-50")}>
            <Avatar
                initials={memberInitials(member)}
                imageUrl={member.avatarUrl}
                size="sm"
                status={presenceToUserStatus(presence)}
                statusBorderClass="border-background"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="title truncate text-sm font-medium text-foreground">
                        {isSelf ? "You" : (member.displayName ?? "Unknown")}
                    </span>
                    {member.role === "admin" && (
                        <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.04em] text-voice">
                            <Crown className="h-3 w-3" /> admin
                        </span>
                    )}
                </div>
                {host && (
                    <div className="mt-0.5">
                        <MemberServerTag host={host} federated={federated} />
                    </div>
                )}
            </div>
            {!isSelf && (
                <ContextMenuTrigger
                    label={`Actions for ${member.displayName ?? "member"}`}
                    items={menuItems}
                    trigger={
                        <IconButton
                            aria-label={`Actions for ${member.displayName ?? "member"}`}
                            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </IconButton>
                    }
                />
            )}
        </div>
    )
}
