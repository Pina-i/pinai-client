import type { ActorUri, ConversationId } from "../../models/e2ee"
import type { WsServerEvent } from "../../models/ws"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { ConversationJoins, JoinContext } from "../e2ee/join-conversations.usecase"

export interface MessagingSession extends JoinContext {
    actorUri: ActorUri
}

export interface MessagingRuntimeDeps {
    session: MessagingSession
    e2ee: Pick<IE2eePort, "consumePendingWelcomes" | "catchUp" | "startFlushing" | "stopFlushing">
    /** The app's one: a send waits on the joins it starts. */
    joins: Pick<ConversationJoins, "sync">
    /** A pushed Welcome brought a group in: the conversation list may have a row to show. */
    conversationsStale: () => void
    report: (what: string, error: unknown) => void
}

export type ListedConversation = { id: ConversationId; removedAt: string | null }

/**
 * What a running app schedules for its conversations, once this device is in, for every client: the archive's
 * uploads; the Welcomes waiting, read at start and on `mls_welcome_ready`; a group caught up on `mls_commit`; the
 * conversations of the list this device holds no group for joined (`ConversationJoins`) at start, when the list's ids
 * or removals change and when the socket comes back. Nothing before `start` or after `stop`.
 */
export class MessagingRuntime {
    private live = false
    private stopped = false
    private listed: readonly ListedConversation[] | null = null
    private listKey: string | null = null
    private readonly deps: MessagingRuntimeDeps

    constructor(deps: MessagingRuntimeDeps) {
        this.deps = deps
    }

    start(): void {
        if (this.live || this.stopped) return
        this.live = true
        const { session, e2ee } = this.deps
        e2ee.startFlushing(session.idpUrl, session.accessToken)
        this.readWelcomes(false)
        if (this.listed) this.join()
    }

    /** The list as the platform holds it; any other change of a row (its last message, its typing) joins nothing. */
    conversationsChanged(list: readonly ListedConversation[]): void {
        const key = list.map((c) => `${c.id}:${c.removedAt ?? ""}`).join(",")
        this.listed = list
        if (key === this.listKey) return
        this.listKey = key
        if (this.live) this.join()
    }

    socketEvent(event: WsServerEvent): void {
        if (!this.live) return
        if (event.type === "mls_commit") this.catchUp(event.data.conversationId as ConversationId)
        else if (event.type === "mls_welcome_ready") this.readWelcomes(true)
    }

    /** A socket that was down: the instance may be back for a join that failed meanwhile. */
    reconnected(): void {
        if (this.live) this.join()
    }

    stop(): void {
        this.stopped = true
        if (!this.live) return
        this.live = false
        this.deps.e2ee.stopFlushing()
    }

    private join(): void {
        const { joins, session, report } = this.deps
        joins.sync(session, this.listed ?? []).catch((e: unknown) => report("looking for conversations to join", e))
    }

    // Moving on with the group now: a message sent from an epoch the others left is read by none of them.
    private catchUp(conversationId: ConversationId): void {
        const { session, e2ee, report } = this.deps
        const accessToken = session.accessToken()
        if (!accessToken) return
        e2ee.catchUp(session.idpUrl, accessToken, conversationId).catch((e: unknown) => report(`catching up with a commit in ${conversationId}`, e))
    }

    private readWelcomes(pushed: boolean): void {
        const { session, e2ee, conversationsStale, report } = this.deps
        const accessToken = session.accessToken()
        if (!accessToken) return
        e2ee.consumePendingWelcomes(session.idpUrl, accessToken, session.actorUri).then(
            ({ joined }) => {
                // A federated group's row comes with the same Note: the list has it to show now.
                if (pushed && joined > 0 && this.live) conversationsStale()
            },
            (e: unknown) => report("reading the Welcomes waiting", e),
        )
    }
}
