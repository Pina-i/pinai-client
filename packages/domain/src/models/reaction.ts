/** A reaction's effect on its message, known by the reaction's own message id. */
export interface ReactionApplication {
    /** The reaction message's own id (the row in `direct_messages`). */
    reaction_message_id: string
    target_message_id: string
    reactor_address: string
    emoji: string
    op: "add" | "remove"
}
