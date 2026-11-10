import type { IDmPort } from "../../ports/dm.port"

export interface ReadSession {
    idpUrl: string
    accessToken: string
}

export interface MarkReadDeps {
    port: IDmPort
    /** The conversation list read again, its `unread_count` with it. */
    refreshList: () => void
}

/** The list is read again only once the marker landed: before, its `unread_count` would still count the messages. */
export async function markConversationReadUseCase(session: ReadSession, conversationId: string, deps: MarkReadDeps): Promise<void> {
    try {
        await deps.port.markConversationRead(session.idpUrl, session.accessToken, conversationId)
    } finally {
        deps.refreshList()
    }
}
