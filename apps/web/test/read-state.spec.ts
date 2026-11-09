/**
 * A message counts as read only while its conversation is open on a window the user is in;
 * otherwise it waits, counted, and the IdP isn't told.
 */
import { describe, expect, it, vi } from "vitest"

import type { ConversationHistory } from "@pinai/domain/models/dm"
import type { IDmPort } from "@pinai/domain/ports/dm.port"
import { markConversationReadUseCase } from "@pinai/domain/usecases/dm/mark-conversation-read.usecase"
import { openConversationUseCase } from "@pinai/domain/usecases/dm/open-conversation.usecase"
import { settleIncomingReadUseCase } from "@pinai/domain/usecases/dm/settle-incoming-read.usecase"

const SESSION = { idpUrl: "https://idp.test", accessToken: "access-1" }

function deps(markRead: IDmPort["markConversationRead"] = async () => {}) {
    const order: string[] = []
    const markConversationRead = vi.fn(async (...args: Parameters<IDmPort["markConversationRead"]>) => {
        await markRead(...args)
        order.push("marked")
    })
    return {
        order,
        markConversationRead,
        value: {
            port: { markConversationRead } as unknown as IDmPort,
            countUnread: vi.fn((id: string) => void order.push(`counted ${id}`)),
            refreshList: vi.fn(() => void order.push("refreshed")),
        },
    }
}

function arriving(conversationId: string, openId: string | null, windowAttended: boolean, senderBlocked = false) {
    return { conversationId, openId, windowAttended, senderBlocked }
}

describe("settleIncomingReadUseCase", () => {
    it("marks a message read on the IdP while its conversation is open and the window attended, counting nothing", async () => {
        const d = deps()

        await settleIncomingReadUseCase(arriving("dm-alice", "dm-alice", true), SESSION, d.value)

        expect(d.markConversationRead).toHaveBeenCalledWith("https://idp.test", "access-1", "dm-alice")
        expect(d.value.countUnread).not.toHaveBeenCalled()
        expect(d.order).toEqual(["marked", "refreshed"])
    })

    it("counts it, and tells the IdP nothing, while the window isn't attended", async () => {
        const d = deps()

        await settleIncomingReadUseCase(arriving("dm-alice", "dm-alice", false), SESSION, d.value)

        expect(d.markConversationRead).not.toHaveBeenCalled()
        expect(d.order).toEqual(["counted dm-alice", "refreshed"])
    })

    it("counts one in another conversation, attended or not", async () => {
        for (const attended of [true, false]) {
            const d = deps()

            await settleIncomingReadUseCase(arriving("group-surf", "dm-alice", attended), SESSION, d.value)

            expect(d.markConversationRead).not.toHaveBeenCalled()
            expect(d.order).toEqual(["counted group-surf", "refreshed"])
        }
    })

    it("never counts one from someone blocked", async () => {
        const d = deps()

        await settleIncomingReadUseCase(arriving("group-surf", null, false, true), SESSION, d.value)

        expect(d.order).toEqual(["refreshed"])
    })

    it("only refreshes the list without a session to mark it with", async () => {
        const d = deps()

        await settleIncomingReadUseCase(arriving("dm-alice", "dm-alice", true), null, d.value)

        expect(d.markConversationRead).not.toHaveBeenCalled()
        expect(d.order).toEqual(["refreshed"])
    })
})

describe("markConversationReadUseCase", () => {
    it("refreshes the list once the marker landed, and also when it failed", async () => {
        const d = deps(async () => {
            throw new Error("offline")
        })

        await expect(markConversationReadUseCase(SESSION, "dm-alice", d.value)).rejects.toThrow("offline")

        expect(d.value.refreshList).toHaveBeenCalledOnce()
    })
})

describe("openConversationUseCase", () => {
    it("reads the list again once the history answered: that GET marked the conversation read", async () => {
        const order: string[] = []
        const history: ConversationHistory = { messages: [], events: [] }
        const getConversation = vi.fn(async () => {
            order.push("history")
            return history
        })
        const refreshList = vi.fn(() => void order.push("refreshed"))

        const opened = await openConversationUseCase(SESSION, "dm-alice", {
            port: { getConversation } as unknown as IDmPort,
            refreshList,
        })

        expect(opened).toBe(history)
        expect(getConversation).toHaveBeenCalledWith("https://idp.test", "access-1", "dm-alice", undefined)
        expect(order).toEqual(["history", "refreshed"])
    })

    it("reads nothing again when the history didn't load", async () => {
        const refreshList = vi.fn()
        const port = {
            getConversation: async () => {
                throw new Error("offline")
            },
        } as unknown as IDmPort

        await expect(openConversationUseCase(SESSION, "dm-alice", { port, refreshList })).rejects.toThrow("offline")
        expect(refreshList).not.toHaveBeenCalled()
    })
})
