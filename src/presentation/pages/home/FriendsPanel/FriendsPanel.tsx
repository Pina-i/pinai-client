import { useState } from "react"
import { Button } from "@/presentation/atoms/Button/Button"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { ContextMenu } from "@/presentation/molecules/ContextMenu/ContextMenu"
import { UserContextMenu } from "@/presentation/molecules/UserContextMenu/UserContextMenu"
import { cn } from "@/presentation/_libs/utils"
import { useFriendsPanelViewModel } from "./FriendsPanel.viewmodel"
import { AddFriendPopover } from "./AddFriendPopover/AddFriendPopover"
import { FriendRow } from "./FriendRow/FriendRow"

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
                    {filteredFriends.map((friend) => (
                        <ContextMenu
                            key={friend.id}
                            trigger={(isOpen) => (
                                <FriendRow
                                    friend={friend}
                                    isActive={isOpen}
                                    onOpen={onStartDm}
                                    onRemove={(f) => setFriendToRemove({ id: f.id, name: f.name })}
                                />
                            )}
                        >
                            {(close) => <UserContextMenu displayName={friend.name} onClose={close} />}
                        </ContextMenu>
                    ))}
                </div>
            </ScrollArea>

            <Modal
                isOpen={!!friendToRemove}
                onClose={() => setFriendToRemove(null)}
                label="Confirm remove friend"
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
