import type { ConversationRef, DmConversationSummary } from "./dm"
import { actorUriToAddress, personName } from "./identity"

/** A row of the conversation list as every client names it; how it looks is each client's. */
export interface ConversationRow extends ConversationRef {
    /** A group's own name, `null` for a DM or an unnamed group. */
    groupName: string | null
    /** A DM's other member, a group's name or else its members'. */
    displayName: string
    /** A DM's other member's actor URI; `null` for a group. */
    actorUri: string | null
    /** Everyone in it, the user included. */
    memberCount: number
    /** The other members' names, the handle only when the IdP has none. */
    memberNames: string[]
    /** When the user was removed from this group; `null` while they are in it. */
    removedAt: string | null
}

export function conversationRow(summary: DmConversationSummary): ConversationRow {
    const firstMember = summary.members[0]
    const address = firstMember ? actorUriToAddress(firstMember.actorUri) : summary.conversation_id
    const displayName =
        summary.kind === "dm"
            ? (firstMember?.displayName ?? address.split("@")[0])
            : (summary.name ?? summary.members.map((m) => m.displayName ?? "?").join(", "))
    return {
        id: summary.conversation_id,
        kind: summary.kind,
        groupName: summary.name,
        displayName,
        address,
        actorUri: summary.kind === "dm" ? (firstMember?.actorUri ?? null) : null,
        // `members` leaves the user out.
        memberCount: summary.members.length + 1,
        memberNames: summary.members.map((m) => personName(m.actorUri, m.displayName)),
        removedAt: summary.removed_at ?? null,
    }
}

/** A conversation's latest message as its row previews it; `null` when nothing is held decrypted to preview. */
export function lastMessagePreview(
    messages: readonly { content: string; authorAddress?: string; attachments?: readonly unknown[] }[] | undefined,
    myAddress: string | undefined,
): string | null {
    const last = messages?.[messages.length - 1]
    if (!last) return null

    let text = last.content?.trim()
    if (!text) {
        if (last.attachments && last.attachments.length > 0) text = "Attachment"
        else return null
    }

    const isOwn = !!myAddress && last.authorAddress === myAddress
    return isOwn ? `You: ${text}` : text
}

/** A group's line where a DM previews its last message: who is in it, or that the user no longer is. */
export function groupFact(group: Pick<ConversationRow, "memberCount" | "removedAt">): string {
    if (group.removedAt != null) return "no longer a member"
    return `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`
}
