import { mergeMessageHistory } from "../../models/dm"
import { reactionsToReplay, snapshotsToReplay, type RestoredMessage } from "../../models/history-archive"
import { addressParts } from "../../models/identity"
import { foldReaction, type ReactionApplication } from "../../models/reaction"
import type { ReceivedText } from "../../models/received-message"
import type { CachedTimelineMessage, ConversationTimeline, IConversationCache } from "../../ports/conversation-cache.port"

/** A restored message as a timeline keeps it. */
export function restoredText(m: RestoredMessage): ReceivedText {
    return {
        id: m.id,
        author: m.senderDisplayName?.trim() || addressParts(m.senderAddress).handle || "Restored",
        authorAddress: m.senderAddress,
        content: m.text,
        createdAt: m.createdAt,
        ...(m.edited ? { edited: true } : {}),
        attachments: m.attachments,
        ...(m.attachmentKeys.length > 0 ? { attachmentKeys: Object.fromEntries(m.attachmentKeys.map((k) => [k.id, k])) } : {}),
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    }
}

/**
 * One conversation's restored messages into its timeline: seeded, then the reactions the cache doesn't hold replayed,
 * each id recorded — history may decrypt one of them again. A re-archive's snapshot sets a message's counts, the named
 * reactions since applied on top.
 */
export function withRestored<M extends CachedTimelineMessage>(
    held: ConversationTimeline<M>,
    restored: readonly RestoredMessage[],
    myAddress: string | undefined,
    toCached: (message: ReceivedText) => M,
): ConversationTimeline<M> {
    const replay = reactionsToReplay(held.messages, restored)
    const snapshots = snapshotsToReplay(held.messages, restored)
    let messages = mergeMessageHistory(held.messages, restored.map((m) => toCached(restoredText(m))))
    let appliedReactionIds = held.appliedReactionIds
    const fold = (application: ReactionApplication, reactedByMe: boolean) => {
        const folded = foldReaction(messages, appliedReactionIds, application, reactedByMe)
        if (!folded) return
        if (folded.messages) messages = folded.messages
        appliedReactionIds = folded.appliedReactionIds
    }
    for (const { messageId, reaction } of replay) {
        fold(
            { reaction_message_id: reaction.id, target_message_id: messageId, reactor_address: reaction.reactorAddress, emoji: reaction.emoji, op: "add" },
            reaction.reactorAddress === myAddress,
        )
    }
    for (const { messageId, snapshot } of snapshots) {
        messages = messages.map((m) => (m.id === messageId ? { ...m, reactions: snapshot.reactions.map((r) => ({ ...r })) } : m))
        for (const op of snapshot.since) {
            fold(
                { reaction_message_id: op.id, target_message_id: messageId, reactor_address: op.reactorAddress, emoji: op.emoji, op: op.op },
                op.reactorAddress === myAddress,
            )
        }
        // Counted in the snapshot already: an absent target records the id only, so a later decrypt adds nothing.
        for (const id of snapshot.counted) {
            fold({ reaction_message_id: id, target_message_id: "", reactor_address: "", emoji: "", op: "add" }, false)
        }
    }
    return { ...held, messages, appliedReactionIds }
}

/**
 * The archive's messages into the conversation cache, one conversation a turn so a large archive doesn't hold the app.
 * Answers the conversations it changed.
 */
export async function applyRestoredHistoryUseCase<M extends CachedTimelineMessage>(
    messages: readonly RestoredMessage[],
    deps: { cache: IConversationCache<M>; myAddress: string | undefined },
): Promise<string[]> {
    const byConversation = new Map<string, RestoredMessage[]>()
    for (const m of messages) {
        const list = byConversation.get(m.conversationId) ?? []
        list.push(m)
        byConversation.set(m.conversationId, list)
    }
    for (const [conversationId, restored] of byConversation) {
        await deps.cache.update(conversationId, (held) => withRestored(held, restored, deps.myAddress, (m) => deps.cache.toCached(m)))
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return [...byConversation.keys()]
}
