/**
 * What a running app schedules for its conversations, for every client: the archive's uploads, the Welcomes read at
 * start and when one is pushed, a group caught up on a pushed commit, and the conversations not held joined at start,
 * when the list's ids or removals change and when the socket comes back. Nothing before `start` or after `stop`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActorUri, ConversationId } from "@pinai/domain/models/e2ee"
import type { WsServerEvent } from "@pinai/domain/models/ws"
import { MessagingRuntime, type ListedConversation } from "@pinai/domain/usecases/dm/messaging-runtime.usecase"

const IDP = "https://idp.test"
const ACTOR = "https://idp.test/users/alice" as ActorUri

function runtime(options: { token?: string | null; joined?: number } = {}) {
    let token: string | null = options.token === undefined ? "tok" : options.token
    const e2ee = {
        consumePendingWelcomes: vi.fn(async () => ({ joined: options.joined ?? 0 })),
        catchUp: vi.fn(async () => undefined),
        startFlushing: vi.fn(),
        stopFlushing: vi.fn(),
    }
    const joins = { sync: vi.fn(async () => undefined) }
    const conversationsStale = vi.fn()
    const report = vi.fn()
    const session = { idpUrl: IDP, actorUri: ACTOR, accessToken: () => token }
    const made = new MessagingRuntime({ session, e2ee, joins, conversationsStale, report })
    return { made, e2ee, joins, conversationsStale, report, session, signOut: () => (token = null) }
}

const row = (id: string, removedAt: string | null = null): ListedConversation => ({ id: id as ConversationId, removedAt })
const commit = (conversationId: string): WsServerEvent => ({ type: "mls_commit", data: { conversationId, epoch: 3 } as never })
const welcome: WsServerEvent = { type: "mls_welcome_ready", data: {} as never }
const settle = () => vi.advanceTimersByTimeAsync(0)

describe("MessagingRuntime", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("starts the uploads, reads the Welcomes waiting and joins the list's conversations", async () => {
        const { made, e2ee, joins, session, conversationsStale } = runtime({ joined: 2 })
        made.conversationsChanged([row("c1")])
        made.start()
        await settle()

        expect(e2ee.startFlushing).toHaveBeenCalledWith(IDP, session.accessToken)
        expect(e2ee.consumePendingWelcomes).toHaveBeenCalledWith(IDP, "tok", ACTOR)
        expect(joins.sync).toHaveBeenCalledWith(session, [row("c1")])
        // The list is being read as the app starts: only a pushed Welcome asks it again.
        expect(conversationsStale).not.toHaveBeenCalled()
    })

    it("does nothing before it starts", async () => {
        const { made, e2ee, joins } = runtime()
        made.conversationsChanged([row("c1")])
        made.socketEvent(commit("c1"))
        made.socketEvent(welcome)
        made.reconnected()
        await settle()

        expect(e2ee.startFlushing).not.toHaveBeenCalled()
        expect(e2ee.catchUp).not.toHaveBeenCalled()
        expect(e2ee.consumePendingWelcomes).not.toHaveBeenCalled()
        expect(joins.sync).not.toHaveBeenCalled()
    })

    it("joins with the first list given after it started", async () => {
        const { made, joins } = runtime()
        made.start()
        await settle()
        expect(joins.sync).not.toHaveBeenCalled()

        made.conversationsChanged([row("c1")])
        await settle()
        expect(joins.sync).toHaveBeenCalledTimes(1)
    })

    it("joins again when the list's ids or removals change, not when a row changes otherwise", async () => {
        const { made, joins } = runtime()
        made.conversationsChanged([row("c1")])
        made.start()
        await settle()

        made.conversationsChanged([{ ...row("c1"), name: "typing…" } as ListedConversation])
        await settle()
        expect(joins.sync).toHaveBeenCalledTimes(1)

        made.conversationsChanged([row("c1"), row("c2")])
        await settle()
        expect(joins.sync).toHaveBeenCalledTimes(2)
        expect(joins.sync).toHaveBeenLastCalledWith(expect.anything(), [row("c1"), row("c2")])

        made.conversationsChanged([row("c1"), row("c2", "2026-11-27T10:00:00Z")])
        await settle()
        expect(joins.sync).toHaveBeenCalledTimes(3)
    })

    it("joins again when the socket comes back", async () => {
        const { made, joins } = runtime()
        made.conversationsChanged([row("c1")])
        made.start()
        made.reconnected()
        await settle()

        expect(joins.sync).toHaveBeenCalledTimes(2)
    })

    it("catches a group up on a pushed commit", async () => {
        const { made, e2ee, report } = runtime()
        made.start()
        made.socketEvent(commit("g1"))
        await settle()
        expect(e2ee.catchUp).toHaveBeenCalledWith(IDP, "tok", "g1")

        e2ee.catchUp.mockRejectedValueOnce(new Error("epoch"))
        made.socketEvent(commit("g2"))
        await settle()
        expect(report).toHaveBeenCalledWith("catching up with a commit in g2", expect.any(Error))
    })

    it("reads the Welcomes on a push, and asks the list again only when one brought a group", async () => {
        const { made, e2ee, conversationsStale } = runtime()
        made.start()
        await settle()

        made.socketEvent(welcome)
        await settle()
        expect(e2ee.consumePendingWelcomes).toHaveBeenCalledTimes(2)
        expect(conversationsStale).not.toHaveBeenCalled()

        e2ee.consumePendingWelcomes.mockResolvedValueOnce({ joined: 1 })
        made.socketEvent(welcome)
        await settle()
        expect(conversationsStale).toHaveBeenCalledTimes(1)
    })

    it("reports what failed and goes on", async () => {
        const { made, e2ee, joins, report } = runtime()
        e2ee.consumePendingWelcomes.mockRejectedValueOnce(new Error("down"))
        joins.sync.mockRejectedValueOnce(new Error("down"))
        made.conversationsChanged([row("c1")])
        made.start()
        await settle()

        expect(report).toHaveBeenCalledWith("reading the Welcomes waiting", expect.any(Error))
        expect(report).toHaveBeenCalledWith("looking for conversations to join", expect.any(Error))
        made.reconnected()
        await settle()
        expect(joins.sync).toHaveBeenCalledTimes(2)
    })

    it("reads nothing without a token", async () => {
        const { made, e2ee, signOut } = runtime()
        signOut()
        made.start()
        made.socketEvent(commit("g1"))
        made.socketEvent(welcome)
        await settle()

        expect(e2ee.consumePendingWelcomes).not.toHaveBeenCalled()
        expect(e2ee.catchUp).not.toHaveBeenCalled()
    })

    it("stops the uploads and does nothing more once stopped, nor starts again", async () => {
        const { made, e2ee, joins, conversationsStale } = runtime()
        e2ee.consumePendingWelcomes.mockResolvedValue({ joined: 1 })
        made.conversationsChanged([row("c1")])
        made.start()
        made.socketEvent(welcome)
        made.stop()
        await settle()
        expect(e2ee.stopFlushing).toHaveBeenCalledTimes(1)
        // A Welcome read as it stopped asks nothing of a list nobody shows.
        expect(conversationsStale).not.toHaveBeenCalled()

        made.conversationsChanged([row("c2")])
        made.socketEvent(commit("c1"))
        made.reconnected()
        made.start()
        await settle()
        expect(joins.sync).toHaveBeenCalledTimes(1)
        expect(e2ee.catchUp).not.toHaveBeenCalled()
        expect(e2ee.startFlushing).toHaveBeenCalledTimes(1)
    })
})
