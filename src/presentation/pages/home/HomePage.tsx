import { AnimatedContent } from "@/presentation/atoms/animated-content/animated-content"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { HomeLayout } from "@/presentation/templates/HomeLayout/HomeLayout"
import { X } from "lucide-react"
import { FriendsPanel } from "./FriendsPanel/FriendsPanel"
import { useHomePageViewModel } from "./HomePage.viewmodel"
import { MessageInput } from "./MessageInput/MessageInput"
import { MessageList } from "./MessageList/MessageList"

export function HomePage() {
    const vm = useHomePageViewModel()

    if (!vm.user) return null

    const contentKey = vm.view === "dms" && !vm.activeDm
        ? "friends"
        : `${vm.view}-${vm.activeDm ?? vm.activeChannel ?? ""}`

    return (
        <PageTransition className="flex flex-1">
        <HomeLayout>
            <AnimatedContent contentKey={contentKey} className="flex flex-1 flex-col">
            {vm.view === "dms" && !vm.activeDm ? (
                <FriendsPanel
                    userAddress={vm.user.address}
                    onStartDm={vm.openDmWith}
                    onSendFriendRequest={vm.sendFriendRequest}
                />
            ) : (
                <div className="flex flex-1 flex-col">
                    {vm.showPinned && vm.pinnedMessages.length > 0 && (
                        <div className="border-b border-border bg-popover px-4 py-3">
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-foreground">Pinned Messages</h3>
                                <button
                                    onClick={() => vm.setShowPinned(false)}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            {vm.pinnedMessages.map((msg) => (
                                <div key={msg.id} className="mb-2 flex items-start gap-3 bg-accent/50 p-2">
                                    <div
                                        className="flex h-8 w-8 shrink-0 items-center justify-center text-xs font-semibold text-primary-foreground"
                                        style={{ backgroundColor: msg.color }}
                                    >
                                        {msg.avatar}
                                    </div>
                                    <div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-sm font-semibold" style={{ color: msg.color }}>
                                                {msg.author}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                                        </div>
                                        <p className="text-sm text-foreground">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {vm.searchQuery && (
                        <div className="border-b border-border bg-popover px-4 py-2">
                            <p className="text-xs text-muted-foreground">
                                {vm.filteredMessages.length} result
                                {vm.filteredMessages.length !== 1 ? "s" : ""} for &quot;{vm.searchQuery}&quot;
                            </p>
                        </div>
                    )}

                    <MessageList
                        messages={vm.filteredMessages}
                        currentUsername={vm.user.preferred_username}
                        onReaction={vm.handleReaction}
                        onDelete={vm.handleDeleteMessage}
                        onEdit={vm.handleEditMessage}
                        onUserClick={vm.handleUserClick}
                        messagesEndRef={vm.messagesEndRef}
                    />

                    <MessageInput placeholder={vm.messagePlaceholder} onSend={vm.sendMessage} />
                </div>
            )}
            </AnimatedContent>
        </HomeLayout>
        </PageTransition>
    )
}
