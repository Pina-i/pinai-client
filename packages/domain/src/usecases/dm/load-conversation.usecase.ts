import type { UserProfile } from "../../models/auth"
import { base64Bytes } from "../../models/bytes"
import { applyFederationStatus, mergeMessageHistory, type DirectMessage } from "../../models/dm"
import type { EditBody, ReactionBody, TextBody } from "../../models/e2ee"
import { archivedEdit, archivedReaction, archivedText } from "../../models/history-archive"
import { foldReaction, type ReactionApplication } from "../../models/reaction"
import { historyWire, receivedMessage } from "../../models/received-message"
import type { CachedTimelineMessage, IConversationCache } from "../../ports/conversation-cache.port"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { MarkReadDeps, ReadSession } from "./mark-conversation-read.usecase"
import { openConversationUseCase } from "./open-conversation.usecase"
import { decrypted } from "./receive-message.usecase"

export interface LoadConversationDeps<M> extends MarkReadDeps {
    e2ee: Pick<IE2eePort, "decryptInbound" | "bufferForArchive" | "bufferEditForArchive">
    cache: IConversationCache<M>
}

/** The user, as their account's own history rows name them. */
export type HistoryReader = Pick<UserProfile, "address" | "display_name" | "preferred_username">

type ReadRow<M> =
    | { kind: "message"; message: M }
    | { kind: "reaction"; reaction: ReactionApplication; mine: boolean }
    | { kind: "nothing" }

/**
 * A conversation opened: its first history page read (`openConversationUseCase`), each row this device doesn't hold
 * decrypted once and archived, then all of it into the cache in one change — the texts merged, the IdP's failed
 * deliveries, the reactions folded once their messages are in, the group's changes.
 */
export async function loadConversationUseCase<M extends CachedTimelineMessage>(
    session: ReadSession,
    conversationId: string,
    me: HistoryReader,
    deps: LoadConversationDeps<M>,
): Promise<void> {
    const history = await openConversationUseCase(session, conversationId, deps)
    const rows = [...history.messages].reverse()
    const held = await deps.cache.read(conversationId)
    const heldById = new Map(held.messages.map((m) => [m.id, m]))
    const read = await Promise.all(
        rows.map((row) => readRow(row, me, session, heldById, held.appliedReactionIds, deps)),
    )
    const texts = read.flatMap((r) => (r.kind === "message" ? [r.message] : []))
    const reactions = read.flatMap((r) => (r.kind === "reaction" ? [r] : []))
    const reactionIds = new Set(reactions.map((r) => r.reaction.reaction_message_id))
    const undelivered = new Set(rows.filter((r) => r.federation_status === "failed").map((r) => r.id))
    const at = new Date().toISOString()

    await deps.cache.update(conversationId, (t) => {
        let messages = mergeMessageHistory(t.messages, texts)
        // The held copy wins the merge, so the IdP's delivery outcome — which may have come while no client was open —
        // goes on top of it.
        if (undelivered.size > 0) {
            messages = messages.map((m) => (undelivered.has(m.id) ? applyFederationStatus(m, "failed", at) : m))
        }
        let appliedReactionIds = t.appliedReactionIds
        for (const { reaction, mine } of reactions) {
            const folded = foldReaction(messages, appliedReactionIds, reaction, mine)
            if (!folded) continue
            messages = folded.messages ?? messages
            appliedReactionIds = folded.appliedReactionIds
        }
        // A reaction that didn't decrypt live was kept as a placeholder message.
        if (messages.some((m) => m.undecrypted && reactionIds.has(m.id))) {
            messages = messages.filter((m) => !(m.undecrypted && reactionIds.has(m.id)))
        }
        return { ...t, messages, appliedReactionIds, groupEvents: mergeMessageHistory(t.groupEvents, history.events) }
    })
}

async function readRow<M extends CachedTimelineMessage>(
    row: DirectMessage,
    me: HistoryReader,
    catchUp: ReadSession,
    heldById: ReadonlyMap<string, M>,
    appliedReactionIds: Readonly<Record<string, true>>,
    deps: LoadConversationDeps<M>,
): Promise<ReadRow<M>> {
    // Forward secrecy deleted the keys of what this device read already: its copy is the only one. One it couldn't
    // decrypt is tried again — the failure deleted no key.
    const held = heldById.get(row.id)
    if (held && !held.undecrypted) return { kind: "message", message: held }
    // A reaction lives folded into its message: decrypted again, its deleted keys would make it a placeholder row.
    if (appliedReactionIds[row.id]) return { kind: "nothing" }

    const ciphertext = base64Bytes(row.mls_ciphertext)
    const app = await decrypted(deps.e2ee, row.conversation_id, ciphertext, catchUp)
    const wire = historyWire(row, me)
    const received = receivedMessage(wire, app, "history")
    const sender = { address: wire.senderAddress, displayName: wire.senderName }
    if (app?.kind === "text") {
        deps.e2ee.bufferForArchive(
            row.conversation_id,
            row.id,
            archivedText(sender, row.created_at, app.body as TextBody, row.attachments),
        )
    } else if (app && ciphertext && received.kind === "edit") {
        // An edited message's ciphertext is the edit's; the archive may hold its first text.
        deps.e2ee.bufferEditForArchive(
            row.conversation_id,
            ciphertext,
            archivedEdit(sender, row.edited_at ?? row.created_at, app.body as EditBody),
        )
    }

    switch (received.kind) {
        case "reaction":
            deps.e2ee.bufferForArchive(
                row.conversation_id,
                row.id,
                archivedReaction(sender, row.created_at, app?.body as ReactionBody),
            )
            return received
        case "nothing":
            return received
        default:
            return { kind: "message", message: deps.cache.toCached(received.message) }
    }
}
