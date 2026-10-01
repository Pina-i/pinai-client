import { useState } from "react"
import { Ban, Crown, Globe, LogOut, MessageSquare, MoreHorizontal, User, UserMinus, UserPlus, Video } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { membersPanelClass } from "@/presentation/organisms/MembersSidebar/members-panel.styles"
import { ContextMenuTrigger } from "@/presentation/molecules/ContextMenu/ContextMenuTrigger"
import type { ContextMenuItem } from "@/presentation/molecules/ContextMenu/ContextMenuList"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { BlockUserModal } from "@/presentation/molecules/BlockUserModal/BlockUserModal"
import { cn } from "@/presentation/_libs/utils"
import { actorUriToAddress } from "@pinai/domain/models/identity"
import { presenceToUserStatus } from "@pinai/domain/models/presence"
import { useAppStore } from "@/store/store"
import type { GroupMember } from "@pinai/domain/models/group"
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
    const [blockTarget, setBlockTarget] = useState<GroupMember | null>(null)

    async function confirmBlock() {
        if (blockTarget && (await vm.block(blockTarget.actorUri, blockTarget.displayName ?? "This member"))) {
            setBlockTarget(null)
        }
    }

    function rosterRow(member: GroupMember) {
        return (
            <RosterRow
                key={member.actorUri}
                member={member}
                isSelf={member.actorUri === vm.myActorUri}
                viewerIsAdmin={vm.isAdmin}
                pending={vm.pendingActor === member.actorUri}
                localHost={vm.localHost}
                onSetRole={vm.setRole}
                onRemove={() => setRemoveTarget(member)}
                isBlocked={vm.isBlocked(member.actorUri)}
                onBlock={() => setBlockTarget(member)}
                onUnblock={() => void vm.unblock(member.actorUri, member.displayName ?? "This member")}
            />
        )
    }

    return (
        // The roster carries actions (add, leave), so unlike the server member
        // list it stays visible on narrow windows.
        <aside className={cn(membersPanelClass, "flex w-[236px] flex-col overflow-hidden max-[1100px]:flex")}>
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
                <p className="eye">
                    Members <span className="fact ml-0.5">{vm.members.length}</span>
                </p>
                {vm.isAdmin && (
                    <IconButton variant="ghost" aria-label="Add people" onPress={vm.openAddPeople} className="text-acc">
                        <UserPlus className="h-4 w-4" />
                    </IconButton>
                )}
            </div>

            <ScrollArea className="flex-1 px-2.5 pb-2">
                {vm.isLoading && <p className="title py-8 text-center text-[12px] italic text-muted-foreground">Loading…</p>}
                {vm.error && <p className="py-8 text-center text-[12px] text-dnd">{vm.error}</p>}

                {vm.admins.length > 0 && (
                    <>
                        <p className="eye mb-1.5 mt-2 pl-2">Admin</p>
                        {vm.admins.map(rosterRow)}
                    </>
                )}

                {vm.regularMembers.length > 0 && (
                    <>
                        <p className="eye mb-1.5 mt-3.5 pl-2">Members</p>
                        {vm.regularMembers.map(rosterRow)}
                    </>
                )}
            </ScrollArea>

            <div className="border-t border-line p-3">
                <Button variant="destructive" size="none" onPress={vm.leaveGroup} className="w-full py-2 text-[12.5px]">
                    <LogOut className="h-4 w-4" /> Leave group
                </Button>
            </div>

            <Modal isOpen={removeTarget !== null} onClose={() => setRemoveTarget(null)} label="Remove member">
                {removeTarget && (
                    <div className={cn(modalSurface, "w-[400px] p-6 text-center")}>
                        <div className="mx-auto mb-3 w-fit">
                            <Avatar
                                initials={memberInitials(removeTarget)}
                                imageUrl={removeTarget.avatarUrl}
                                seed={actorUriToAddress(removeTarget.actorUri)}
                                size="lg"
                            />
                        </div>
                        <h3 className="title text-[20px] font-normal text-foreground">
                            Remove {removeTarget.displayName ?? "this member"}?
                        </h3>
                        <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
                            They'll be removed from the group and won't see new messages. Earlier messages stay with
                            the group.
                        </p>
                        <div className="mt-6 flex justify-center gap-2">
                            <Button variant="secondary" size="inline" onPress={() => setRemoveTarget(null)}>
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="inline"
                                onPress={() => {
                                    void vm.removeMember(removeTarget.actorUri)
                                    setRemoveTarget(null)
                                }}
                                className="font-semibold"
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
            <BlockUserModal
                name={blockTarget ? (blockTarget.displayName ?? "this member") : null}
                isPending={vm.isBlocking}
                onCancel={() => setBlockTarget(null)}
                onConfirm={confirmBlock}
            />
        </aside>
    )
}

function MemberServerTag({ host, federated }: { host: string; federated: boolean }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[9px] tracking-[0.04em]",
                federated ? "border-acc-line bg-acc-soft text-acc" : "border-line text-muted-foreground",
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
    isBlocked,
    onBlock,
    onUnblock,
}: {
    member: GroupMember
    isSelf: boolean
    viewerIsAdmin: boolean
    pending: boolean
    localHost: string | null
    onSetRole: (actorUri: string, role: "admin" | "member") => void
    onRemove: () => void
    isBlocked: boolean
    onBlock: () => void
    onUnblock: () => void
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
        isBlocked
            ? { key: "unblock", label: "Unblock", icon: <Ban className="h-4 w-4" />, onAction: onUnblock }
            : { key: "block", label: "Block", icon: <Ban className="h-4 w-4" />, variant: "destructive", onAction: onBlock },
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
        <div
            className={cn(
                "flex items-center gap-2.5 rounded-full px-2.5 py-2 transition-colors duration-150 hover:bg-surf2",
                pending && "opacity-50",
            )}
        >
            <Avatar
                initials={memberInitials(member)}
                imageUrl={member.avatarUrl}
                seed={address}
                size="sm"
                status={presenceToUserStatus(presence)}
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold text-foreground">
                        {isSelf ? "You" : (member.displayName ?? "Unknown")}
                    </span>
                    {member.role === "admin" && (
                        <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.04em] text-sec">
                            <Crown className="h-3 w-3" /> admin
                        </span>
                    )}
                    {isBlocked && (
                        <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.04em] text-dnd">
                            <Ban className="h-3 w-3" /> blocked
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
                        <IconButton variant="ghost" aria-label={`Actions for ${member.displayName ?? "member"}`}>
                            <MoreHorizontal className="h-4 w-4" />
                        </IconButton>
                    }
                />
            )}
        </div>
    )
}
