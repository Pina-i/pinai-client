import { useRef, useState, type DragEvent } from "react"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { DropOverlay } from "@/presentation/molecules/DropOverlay/DropOverlay"
import { MessageInput } from "@/presentation/molecules/MessageInput/MessageInput"
import type { MessageInputHandle } from "@/presentation/molecules/MessageInput/MessageInput.viewmodel"
import { RemoveGroupFromListModal } from "@/presentation/molecules/RemoveGroupFromListModal/RemoveGroupFromListModal"
import { ConversationTypingIndicator } from "./ConversationTypingIndicator/ConversationTypingIndicator"
import { BlockedComposer } from "./BlockedComposer/BlockedComposer"
import { ConversationTimeline } from "./ConversationTimeline/ConversationTimeline"
import { ConversationUnavailable } from "./ConversationUnavailable/ConversationUnavailable"
import { RemovedComposer } from "./RemovedComposer/RemovedComposer"
import { useConversationPageViewModel } from "./ConversationPage.viewmodel"

interface ConversationPageProps {
    name: string
}

/** True when the OS drag carries actual files (not just dragged text). */
function dragHasFiles(e: DragEvent<HTMLDivElement>): boolean {
    return Array.from(e.dataTransfer.types).includes("Files")
}

export function ConversationPage({ name }: ConversationPageProps) {
    const vm = useConversationPageViewModel(name)

    const messageInputRef = useRef<MessageInputHandle | null>(null)

    // The browser fires `dragleave` for every nested element you cross over;
    // counting enter/leave pairs is the standard fix to keep the overlay
    // stable while dragging across child boundaries.
    const dragDepthRef = useRef(0)
    const [isDragging, setIsDragging] = useState(false)

    function handleDragEnter(e: DragEvent<HTMLDivElement>) {
        if (!dragHasFiles(e)) return
        e.preventDefault()
        dragDepthRef.current += 1
        if (dragDepthRef.current === 1) setIsDragging(true)
    }

    function handleDragOver(e: DragEvent<HTMLDivElement>) {
        if (!dragHasFiles(e)) return
        e.preventDefault()
        // copy is the right cursor — we keep the original on the user's disk.
        e.dataTransfer.dropEffect = "copy"
    }

    function handleDragLeave(e: DragEvent<HTMLDivElement>) {
        if (!dragHasFiles(e)) return
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setIsDragging(false)
    }

    function handleDrop(e: DragEvent<HTMLDivElement>) {
        if (!dragHasFiles(e)) return
        e.preventDefault()
        dragDepthRef.current = 0
        setIsDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) messageInputRef.current?.addFiles(files)
    }

    if (!vm.user) return null

    if (vm.isUnavailable) {
        return (
            <PageTransition className="flex min-h-0 min-w-0 flex-1">
                <ConversationUnavailable />
            </PageTransition>
        )
    }

    return (
        <PageTransition className="flex min-h-0 min-w-0 flex-1">
            <div
                className="relative flex min-h-0 min-w-0 flex-1 flex-col"
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <ConversationTimeline
                    key={vm.conversationKey}
                    messages={vm.messages}
                    notices={vm.notices}
                    isLoading={vm.isHistoryLoading}
                    conversationKey={vm.conversationKey}
                    recipientAddress={vm.recipientAddress}
                    isGroup={vm.isGroup}
                    onReply={vm.handleReply}
                    onRetry={vm.retrySend}
                    canResend={vm.canResend}
                    handleRef={vm.messageListHandleRef}
                />
                {vm.isRemoved ? (
                    <RemovedComposer onRemoveFromList={vm.askDismiss} />
                ) : vm.peerBlocked ? (
                    <BlockedComposer
                        name={vm.displayName}
                        isPending={vm.isUnblocking}
                        onUnblock={vm.unblockPeer}
                    />
                ) : (
                    <>
                        <ConversationTypingIndicator conversationKey={vm.conversationKey} peerDisplayName={vm.typingPeerName} />
                        <MessageInput
                            placeholder={`Send a message to ${vm.displayName}`}
                            onSend={vm.sendMessage}
                            onType={vm.handleType}
                            replyTo={vm.replyingTo}
                            onCancelReply={vm.cancelReply}
                            handleRef={messageInputRef}
                        />
                    </>
                )}
                <DropOverlay isVisible={isDragging} />
            </div>
            <RemoveGroupFromListModal
                groupName={vm.isConfirmingDismiss ? vm.displayName : null}
                isPending={vm.isDismissing}
                onCancel={vm.cancelDismiss}
                onConfirm={vm.confirmDismiss}
            />
        </PageTransition>
    )
}
