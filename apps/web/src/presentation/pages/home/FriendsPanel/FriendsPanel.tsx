import { useState } from "react"
import { ContextMenu } from "@/presentation/molecules/ContextMenu/ContextMenu"
import { UserContextMenu } from "@/presentation/molecules/UserContextMenu/UserContextMenu"
import { RemoveFriendModal } from "@/presentation/molecules/RemoveFriendModal/RemoveFriendModal"
import { useRemoveFriend } from "@/presentation/hooks/useRemoveFriend"
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

    const { removeFriend, isRemoving } = useRemoveFriend()

    async function handleConfirmRemove() {
        if (!friendToRemove) return
        if (await removeFriend(friendToRemove.id, friendToRemove.name)) setFriendToRemove(null)
    }

    const filteredFriends = friends.filter((f) => {
        if (activeTab === "Online") return f.status === "online"
        return true
    })

    const onlineCount = friends.filter((f) => f.status === "online").length

    return (
        <div className="relative flex min-h-0 flex-1 flex-col px-1.5">
            <div className="flex items-start justify-between gap-3 px-1.5 pt-1">
                <div className="flex min-w-0 flex-wrap gap-1 self-start rounded-[22px] bg-surf2 p-1">
                    {friendTabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "flex-none cursor-pointer rounded-full px-4 py-[7px] text-[12.5px] transition-colors duration-150 max-[1180px]:px-[11px]",
                                activeTab === tab
                                    ? "bg-acc font-bold text-acc-ink"
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

            <div className="mx-2 mb-2 mt-3.5 flex justify-between">
                <span className="eye">
                    Online <span className="fact ml-0.5">{onlineCount}</span>
                </span>
                <span className="eye">Showing {activeTab.toLowerCase()}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                {isLoading && (
                    <p className="title py-8 text-center text-[13px] italic text-muted-foreground">Loading friends…</p>
                )}
                {error && <p className="py-8 text-center text-[13px] text-dnd">{error}</p>}
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
                        {(close) => (
                            <UserContextMenu
                                displayName={friend.name}
                                onClose={close}
                                onMessage={() => onStartDm(friend.address)}
                                onRemove={() => setFriendToRemove({ id: friend.id, name: friend.name })}
                            />
                        )}
                    </ContextMenu>
                ))}
            </div>

            <RemoveFriendModal
                friendName={friendToRemove?.name ?? null}
                isPending={isRemoving}
                onCancel={() => setFriendToRemove(null)}
                onConfirm={handleConfirmRemove}
            />
        </div>
    )
}
