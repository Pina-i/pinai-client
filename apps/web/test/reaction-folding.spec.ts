import { describe, expect, it } from "vitest"
import { foldReaction, type MessageReaction, type ReactionApplication } from "@pinai/domain/models/reaction"

type Row = { id: string; content: string; reactions?: MessageReaction[] }

const add = (id: string, emoji = "👍", target = "m1"): ReactionApplication => ({
    reaction_message_id: id,
    target_message_id: target,
    reactor_address: "bob@moana.social",
    emoji,
    op: "add",
})
const remove = (id: string, emoji = "👍"): ReactionApplication => ({ ...add(id, emoji), op: "remove" })

const message = (reactions?: MessageReaction[]): Row => ({ id: "m1", content: "hi", ...(reactions && { reactions }) })

describe("foldReaction", () => {
    it("counts a first reaction, the user's own marked", () => {
        expect(foldReaction([message()], {}, add("r1"), false)).toEqual({
            messages: [{ id: "m1", content: "hi", reactions: [{ emoji: "👍", count: 1, reacted: false }] }],
            appliedReactionIds: { r1: true },
        })
        expect(foldReaction([message()], {}, add("r1"), true)?.messages?.[0].reactions).toEqual([{ emoji: "👍", count: 1, reacted: true }])
    })

    it("adds to an emoji's count, the user's mark kept or set", () => {
        const held = message([{ emoji: "👍", count: 1, reacted: true }])
        expect(foldReaction([held], {}, add("r2"), false)?.messages?.[0].reactions).toEqual([{ emoji: "👍", count: 2, reacted: true }])
        const peers = message([{ emoji: "👍", count: 1, reacted: false }])
        expect(foldReaction([peers], {}, add("r2"), true)?.messages?.[0].reactions).toEqual([{ emoji: "👍", count: 2, reacted: true }])
    })

    it("takes one off a count, clearing the mark only for the user's own", () => {
        const held = message([{ emoji: "👍", count: 3, reacted: true }])
        expect(foldReaction([held], {}, remove("r3"), false)?.messages?.[0].reactions).toEqual([{ emoji: "👍", count: 2, reacted: true }])
        expect(foldReaction([held], {}, remove("r3"), true)?.messages?.[0].reactions).toEqual([{ emoji: "👍", count: 2, reacted: false }])
    })

    it("drops an emoji whose count reaches nothing, the others kept in order", () => {
        const held = message([
            { emoji: "👍", count: 1, reacted: true },
            { emoji: "🌺", count: 2, reacted: false },
        ])
        expect(foldReaction([held], {}, remove("r4"), true)?.messages?.[0].reactions).toEqual([{ emoji: "🌺", count: 2, reacted: false }])
    })

    it("changes no count for the removal of an emoji the message doesn't carry, recording it all the same", () => {
        const folded = foldReaction([message()], {}, remove("r5", "🔥"), false)
        expect(folded).toEqual({ messages: [{ id: "m1", content: "hi", reactions: [] }], appliedReactionIds: { r5: true } })
    })

    it("applies a reaction once: one applied already changes nothing", () => {
        expect(foldReaction([message()], { r1: true }, add("r1"), false)).toBeNull()
    })

    it("records the reaction without its message, or without the conversation, so a later decrypt adds nothing", () => {
        expect(foldReaction([message()], { r0: true }, add("r6", "👍", "elsewhere"), false)).toEqual({ appliedReactionIds: { r0: true, r6: true } })
        expect(foldReaction(undefined, {}, add("r7"), false)).toEqual({ appliedReactionIds: { r7: true } })
    })

    it("leaves the lists it was given untouched, the other messages the same objects", () => {
        const other = { id: "m0", content: "before" }
        const target = message([{ emoji: "👍", count: 1, reacted: false }])
        const messages = [other, target]
        const applied = { r0: true as const }

        const folded = foldReaction(messages, applied, add("r8"), false)

        expect(folded?.messages?.[0]).toBe(other)
        expect(messages[1]).toBe(target)
        expect(target.reactions).toEqual([{ emoji: "👍", count: 1, reacted: false }])
        expect(applied).toEqual({ r0: true })
    })
})
