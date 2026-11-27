/**
 * The web's store as the domain's conversation cache: a conversation read as it is held, and a change setting only
 * what it replaced — the cache guard skips a save whose persisted fields are the objects it last read or wrote.
 */
import { beforeEach, describe, expect, it } from "vitest"

import type { GroupEvent } from "@pinai/domain/models/group-event"
import { asActorUri } from "@pinai/domain/models/identity"
import { newDeviceLine } from "@pinai/domain/models/new-device"
import { receiveMessageUseCase } from "@pinai/domain/usecases/dm/receive-message.usecase"
import { conversationCache } from "@/presentation/_libs/conversation-cache"
import type { Message } from "@/lib/types"
import { useAppStore } from "@/store/store"

const AT = "2026-11-27T10:00:00.000Z"
const message = (id: string, content = "kia ora"): Message => ({
    id,
    author: "Bob",
    authorAddress: "bob@moana.social",
    avatar: "BO",
    content,
    timestamp: "10:00",
    createdAt: AT,
    color: "#a78bfa",
})
const event: GroupEvent = {
    id: "e1",
    conversationId: "c1",
    event: "created",
    actorUri: "https://moana.social/users/bob",
    actorDisplayName: "Bob",
    createdAt: AT,
}
const line = newDeviceLine(
    { conversationId: "c1", epoch: 4, actorUri: asActorUri("https://moana.social/users/bob"), deviceId: "laptop", createdAt: AT },
    "Bob",
)

beforeEach(() => {
    useAppStore.setState({
        dmMessages: { c1: [message("m1")], c2: [message("m2")] },
        appliedReactionIds: { r1: true },
        groupEvents: { c1: [event] },
        newDeviceLines: { c1: [line] },
    })
})

describe("the store as the conversation cache", () => {
    it("reads a conversation as held, the applied reaction ids its own", async () => {
        expect(await conversationCache.read("c1")).toEqual({
            messages: [message("m1")],
            appliedReactionIds: { r1: true },
            groupEvents: [event],
            newDeviceLines: [line],
        })
        expect(await conversationCache.read("c9")).toEqual({
            messages: [],
            appliedReactionIds: { r1: true },
            groupEvents: [],
            newDeviceLines: [],
        })
        expect(await conversationCache.conversationIds()).toEqual(["c1", "c2"])
    })

    it("sets only what a change replaced, and nothing when it gives back what it was given", async () => {
        const before = useAppStore.getState()

        await conversationCache.update("c1", (held) => held)
        await conversationCache.update("c9", (held) => ({ ...held, messages: held.messages }))
        expect(useAppStore.getState()).toBe(before)

        await conversationCache.update("c1", (held) => ({ ...held, messages: [...held.messages, message("m3")] }))
        const after = useAppStore.getState()
        expect(after.dmMessages.c1.map((m) => m.id)).toEqual(["m1", "m3"])
        expect(after.dmMessages.c2).toBe(before.dmMessages.c2)
        expect(after.appliedReactionIds).toBe(before.appliedReactionIds)
        expect(after.groupEvents).toBe(before.groupEvents)
        expect(after.newDeviceLines).toBe(before.newDeviceLines)

        await conversationCache.update("c9", (held) => ({ ...held, appliedReactionIds: { ...held.appliedReactionIds, r2: true } }))
        expect(useAppStore.getState().appliedReactionIds).toEqual({ r1: true, r2: true })
        expect(useAppStore.getState().dmMessages).toBe(after.dmMessages)
    })

    it("leaves a new-device value of another shape, read back from the cache, as it is", async () => {
        const odd = { not: "a list" } as unknown as readonly never[]
        useAppStore.setState({ newDeviceLines: { c1: odd } })

        expect((await conversationCache.read("c1")).newDeviceLines).toEqual([])
        await conversationCache.update("c1", (held) => ({ ...held, newDeviceLines: [line] }))

        expect(useAppStore.getState().newDeviceLines.c1).toBe(odd)
    })

    it("holds a message received through the domain as the timeline draws it", async () => {
        const e2ee = {
            decryptInbound: async () => ({ version: 1 as const, kind: "text" as const, body: { text: "aloha" } }),
            bufferForArchive: () => undefined,
            bufferEditForArchive: () => undefined,
        }
        const push = {
            message_id: "m4",
            conversation_id: "c2",
            kind: "dm" as const,
            sender_address: "https://moana.social/users/bob",
            sender_display_name: "Bob",
            mls_ciphertext: btoa("ciphertext"),
            created_at: AT,
        }

        await receiveMessageUseCase(push, { myAddress: "alice@kauai.pinai" }, { e2ee, cache: conversationCache })

        expect(useAppStore.getState().dmMessages.c2).toEqual([
            message("m2"),
            {
                ...message("m4", "aloha"),
                timestamp: new Date(AT).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                attachments: undefined,
                attachmentKeys: undefined,
            },
        ])
    })
})
