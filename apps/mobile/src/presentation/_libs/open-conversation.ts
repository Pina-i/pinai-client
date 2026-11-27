// The conversation on screen, if any: a message arriving there while the app is in front is read at once.
let openId: string | null = null

export function openConversationId(): string | null {
    return openId
}

/** This conversation is on screen until the answer is called. */
export function showConversation(conversationId: string): () => void {
    openId = conversationId
    return () => {
        // Another conversation opened meanwhile keeps its place.
        if (openId === conversationId) openId = null
    }
}
