/** A reaction's effect on its message, known by the reaction's own message id. */
export interface ReactionApplication {
    /** The reaction message's own id (the row in `direct_messages`). */
    reaction_message_id: string
    target_message_id: string
    reactor_address: string
    emoji: string
    op: "add" | "remove"
}

/** One emoji's count on a message; `reacted`, whether the user's own is among them. */
export interface MessageReaction {
    emoji: string
    count: number
    reacted: boolean
}

export interface FoldedReaction<T> {
    /** The conversation's messages, only when the reaction changed one of them. */
    messages?: T[]
    appliedReactionIds: Record<string, true>
}

/**
 * A reaction folded into its message's counts, once per reaction id: `null` when it was applied
 * already. The id is recorded even when the conversation or the message isn't held, so a later
 * decrypt of the same reaction — history's — adds nothing.
 */
export function foldReaction<T extends { id: string; reactions?: readonly MessageReaction[] }>(
    messages: readonly T[] | undefined,
    appliedReactionIds: Readonly<Record<string, true>>,
    application: ReactionApplication,
    reactedByMe: boolean,
): FoldedReaction<T> | null {
    if (appliedReactionIds[application.reaction_message_id]) return null
    const applied = { ...appliedReactionIds, [application.reaction_message_id]: true as const }
    const at = messages ? messages.findIndex((m) => m.id === application.target_message_id) : -1
    if (!messages || at === -1) return { appliedReactionIds: applied }
    const next = [...messages]
    next[at] = { ...messages[at], reactions: withReaction(messages[at].reactions ?? [], application, reactedByMe) }
    return { messages: next, appliedReactionIds: applied }
}

function withReaction(
    held: readonly MessageReaction[],
    { emoji, op }: ReactionApplication,
    reactedByMe: boolean,
): MessageReaction[] {
    const reactions = [...held]
    const at = reactions.findIndex((r) => r.emoji === emoji)
    if (op === "add") {
        if (at === -1) reactions.push({ emoji, count: 1, reacted: reactedByMe })
        else reactions[at] = { ...reactions[at], count: reactions[at].count + 1, reacted: reactions[at].reacted || reactedByMe }
    } else if (at !== -1) {
        const count = reactions[at].count - 1
        if (count <= 0) reactions.splice(at, 1)
        else reactions[at] = { ...reactions[at], count, reacted: reactedByMe ? false : reactions[at].reacted }
    }
    return reactions
}
