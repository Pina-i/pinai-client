import { Copy, Check, MessageSquare, MoreHorizontal } from "lucide-react"
import { useState } from "react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import { cn } from "@/presentation/_libs/utils"
import type { Friend } from "@/lib/types"

const friendTabs = ["All", "Online", "Pending", "Blocked"] as const
type FriendTab = (typeof friendTabs)[number]

interface FriendsPanelProps {
    friends: Friend[]
    userHandle: string
    onStartDm: (name: string) => void
    onSendFriendRequest: (handle: string) => Promise<unknown>
}

export function FriendsPanel({ friends, userHandle, onStartDm, onSendFriendRequest }: FriendsPanelProps) {
    const [activeTab, setActiveTab] = useState<FriendTab>("All")
    const [showAddFriend, setShowAddFriend] = useState(false)
    const [friendInput, setFriendInput] = useState("")
    const [requestStatus, setRequestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
    const [requestError, setRequestError] = useState("")
    const [copied, setCopied] = useState(false)

    function copyHandle() {
        navigator.clipboard.writeText(userHandle)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const filteredFriends = friends.filter((f) => {
        if (activeTab === "Online") return f.status === "online"
        return true
    })

    async function sendFriendRequest() {
        if (!friendInput.trim()) return
        setRequestStatus("sending")
        setRequestError("")
        try {
            await onSendFriendRequest(friendInput.trim())
            setRequestStatus("sent")
            setFriendInput("")
        } catch (e) {
            setRequestStatus("error")
            setRequestError(e instanceof Error ? e.message : "Failed to send request")
        }
    }

    return (
        <div className="flex flex-1 flex-col">
            {/* Sub-nav */}
            <div className="flex items-center gap-4 border-b border-border px-4 py-2">
                {friendTabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            "text-sm transition-colors",
                            activeTab === tab
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {tab}
                    </button>
                ))}
                <Button
                    variant="primary"
                    onPress={() => {
                        setShowAddFriend(true)
                        setRequestStatus("idle")
                        setRequestError("")
                    }}
                    className="ml-auto w-auto px-3 py-1 text-xs"
                >
                    Add Friend
                </Button>
            </div>

            {/* Add friend form */}
            {showAddFriend && (
                <div className="border-b border-border bg-popover px-6 py-4">
                    <h3 className="mb-1 text-sm font-semibold uppercase text-foreground">Add Friend</h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                        You can add friends with their username. Yours is{" "}
                        <button onClick={copyHandle} className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline">
                            {userHandle}
                            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                    </p>
                    <div className="flex items-end gap-2">
                        <TextField
                            placeholder="Enter a username#0000"
                            value={friendInput}
                            onChange={setFriendInput}
                            className="flex-1"
                        />
                        <Button
                            variant="primary"
                            onPress={sendFriendRequest}
                            isDisabled={!friendInput.trim() || requestStatus === "sending"}
                            className="w-auto px-4 py-2"
                        >
                            {requestStatus === "sending" ? "Sending…" : "Send Request"}
                        </Button>
                    </div>
                    {requestStatus === "sent" && <p className="mt-2 text-xs text-online">Friend request sent successfully!</p>}
                    {requestStatus === "error" && <p className="mt-2 text-xs text-destructive">{requestError}</p>}
                </div>
            )}

            {/* Friends list */}
            <ScrollArea className="flex-1 px-4 py-4">
                <div className="flex flex-col gap-1">
                    {filteredFriends.map((friend) => {
                        const initials = friend.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                        return (
                            <div key={friend.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30">
                                <Avatar
                                    initials={initials}
                                    size="md"
                                    status={friend.status}
                                    statusBorderClass="border-background"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground">{friend.name}</p>
                                    <p className="text-xs text-muted-foreground">{friend.activity || friend.status}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <IconButton
                                        onPress={() => onStartDm(friend.name)}
                                        aria-label={`Message ${friend.name}`}
                                        className="rounded-full bg-accent p-2 text-muted-foreground hover:text-foreground"
                                    >
                                        <MessageSquare className="h-4 w-4" />
                                    </IconButton>
                                    <IconButton
                                        aria-label="More options"
                                        className="rounded-full bg-accent p-2 text-muted-foreground hover:text-foreground"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </IconButton>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}
