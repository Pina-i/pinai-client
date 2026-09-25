import { useState } from "react"
import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
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

            <Modal
                isOpen={!!friendToRemove}
                onClose={() => setFriendToRemove(null)}
                label="Confirm remove friend"
            >
                <div className={cn(modalSurface, "w-[420px] p-6")}>
                    <h3 className="title text-[20px] font-normal text-foreground">Remove friend?</h3>
                    <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
                        Are you sure you want to remove{" "}
                        <span className="font-medium text-foreground">{friendToRemove?.name}</span>{" "}
                        from your friends? This cannot be undone.
                    </p>
                    <div className="mt-6 flex justify-end gap-2">
                        <Button variant="secondary" size="inline" onPress={() => setFriendToRemove(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" size="inline" onPress={handleConfirmRemove} className="font-semibold">
                            Remove
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
