import { UserMinus } from "lucide-react"
import { useState } from "react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Button } from "@/presentation/atoms/Button/Button"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { cn } from "@/presentation/_libs/utils"
import { userStatusLabel } from "@/domain/models/presence"
import { useFriendsPanelViewModel } from "./FriendsPanel.viewmodel"
import { AddFriendPopover } from "./AddFriendPopover/AddFriendPopover"

const friendTabs = ["All", "Online", "Pending", "Blocked"] as const
type FriendTab = (typeof friendTabs)[number]

interface FriendsPanelProps {
    userAddress: string
    onStartDm: (name: string) => void
    onSendFriendRequest: (address: string) => Promise<unknown>
}

export function FriendsPanel({ userAddress, onStartDm, onSendFriendRequest }: FriendsPanelProps) {
    const { friends, isLoading, error } = useFriendsPanelViewModel()
    const [activeTab, setActiveTab] = useState<FriendTab>("All")
    const [friendToRemove, setFriendToRemove] = useState<{ id: string; name: string } | null>(null)

    function handleConfirmRemove() {
        // TODO: call removeFriend once the social port/adapter exposes it.
        setFriendToRemove(null)
    }

    const filteredFriends = friends.filter((f) => {
        if (activeTab === "Online") return f.status === "online"
        return true
    })

    const onlineCount = friends.filter((f) => f.status === "online").length

    return (
        <div className="flex flex-1 flex-col">
            {/* Filter row + Add Friend */}
            <div className="flex items-center justify-between gap-4 px-8 pb-3 pt-5">
                <div className="flex gap-1 rounded-md bg-muted p-[3px]">
                    {friendTabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "cursor-pointer rounded px-3.5 py-1.5 text-xs transition-colors",
                                activeTab === tab
                                    ? "bg-card font-medium text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                <AddFriendPopover
                    userAddress={userAddress}
                    onSendFriendRequest={onSendFriendRequest}
                />
            </div>

            {/* Mono section eyebrow */}
            <div className="flex items-center justify-between border-b border-border px-8 pb-2 pt-1 mono-eyebrow">
                <span>Online — {onlineCount}</span>
                <span>Showing {activeTab.toLowerCase()}</span>
            </div>

            {/* Friends list */}
            <ScrollArea className="flex-1 px-4 py-2">
                {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
                {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
                <div className="flex flex-col">
                    {filteredFriends.map((friend) => {
                        const initials = friend.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                        return (
                            <div
                                key={friend.id}
                                onClick={() => onStartDm(friend.address)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && onStartDm(friend.address)}
                                className="group flex cursor-pointer items-center gap-4 rounded-md border-b border-border/40 px-4 py-3 transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Avatar
                                    initials={initials}
                                    imageUrl={friend.avatarUrl}
                                    size="md"
                                    status={friend.status}
                                    statusBorderClass="border-background"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <span className="title text-[15px] font-medium text-foreground">{friend.name}</span>
                                        <span className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
                                            {friend.address}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
                                        <span className={cn("mr-1", `text-${friend.status === "online" ? "success" : friend.status === "idle" ? "warning" : "muted-foreground"}`)}>●</span>
                                        {userStatusLabel(friend.status)}
                                    </p>
                                </div>
                                <button
                                    aria-label={`Remove ${friend.name}`}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setFriendToRemove({ id: friend.id, name: friend.name })
                                    }}
                                    className="cursor-pointer rounded-md p-2 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                >
                                    <UserMinus className="h-4 w-4" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>

            <Modal
                isOpen={!!friendToRemove}
                onClose={() => setFriendToRemove(null)}
            >
                <div className="w-[420px] rounded-[var(--radius-lg)] border border-border-strong bg-popover p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55)]">
                    <h3 className="title text-base font-medium text-foreground">Remove friend?</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Are you sure you want to remove{" "}
                        <span className="font-medium text-foreground">{friendToRemove?.name}</span>{" "}
                        from your friends? This cannot be undone.
                    </p>
                    <div className="mt-6 flex justify-end gap-2">
                        <Button
                            variant="secondary"
                            onPress={() => setFriendToRemove(null)}
                            className="w-auto px-4"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onPress={handleConfirmRemove}
                            className="w-auto px-4"
                        >
                            Remove
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
