import { describe, expect, it } from "vitest"
import { matchText, searchConversations, type SearchSources } from "@pinai/domain/models/conversation-search"

interface Friend {
    name: string
    address: string
}

interface Conversation {
    id: string
    kind: "dm" | "group"
    displayName: string
    address: string
    memberNames: string[]
}

interface Server {
    id: string
    name: string
}

interface Channel {
    id: string
    name: string
    type: "text" | "voice"
}

const mika: Friend = { name: "Mika", address: "mika@idp.aotearoa.nz" }
const ana: Friend = { name: "Ana", address: "ana@node.pacific.im" }
const hana: Friend = { name: "Hana", address: "hana@chat.moana.dev" }

const dmMika: Conversation = { id: "dm-mika", kind: "dm", displayName: "Mika", address: mika.address, memberNames: ["Mika"] }
const dmRangi: Conversation = {
    id: "dm-rangi",
    kind: "dm",
    displayName: "Rangi",
    address: "rangi@pinai.example",
    memberNames: ["Rangi"],
}
const working: Conversation = {
    id: "group-mls",
    kind: "group",
    displayName: "MLS working group",
    address: mika.address,
    memberNames: ["Mika", "Tama", "Lani"],
}

const aotearoa: Server = { id: "aot", name: "Aotearoa collective" }
const general: Channel = { id: "general", name: "general", type: "text" }
const lounge: Channel = { id: "lounge", name: "lounge", type: "voice" }

function sources(overrides: Partial<SearchSources<Friend, Conversation, Server, Channel>> = {}) {
    return {
        friends: [mika, ana, hana],
        conversations: [dmMika, dmRangi, working],
        servers: [{ server: aotearoa, channels: [general, lounge] }],
        ...overrides,
    }
}

describe("matchText", () => {
    it("ignores case", () => {
        expect(matchText("Mika", "MIK")).toEqual({ start: 0, end: 3 })
    })

    it("ignores diacritics, marking the accented letters", () => {
        expect(matchText("Māui", "maui")).toEqual({ start: 0, end: 4 })
        expect(matchText("Hōne Tāwhiao", "tawh")).toEqual({ start: 5, end: 9 })
        expect(matchText("Đặng", "dang")).toEqual({ start: 0, end: 4 })
    })

    it("folds the letters decomposing leaves whole, and full-width ones", () => {
        expect(matchText("Łukasz", "lukasz")).toEqual({ start: 0, end: 6 })
        expect(matchText("Søren", "soren")).toEqual({ start: 0, end: 5 })
        expect(matchText("Straße", "strasse")).toEqual({ start: 0, end: 6 })
        expect(matchText("ΟΔΥΣΣΕΥΣ", "οδυσσευς")).toEqual({ start: 0, end: 8 })
        expect(matchText("Ｍｉｋａ", "mika")).toEqual({ start: 0, end: 4 })
    })

    it("ignores ʻokina and apostrophes, marking them only between matched letters", () => {
        expect(matchText("Pīna'i", "pinai")).toEqual({ start: 0, end: 6 })
        expect(matchText("Pīna'i", "pina")).toEqual({ start: 0, end: 4 })
        expect(matchText("Hawaiʻi", "waii")).toEqual({ start: 2, end: 7 })
        expect(matchText("Hawaiʻi", "hawai`i")).toEqual({ start: 0, end: 7 })
        expect(matchText("Pīna’i", "na'i")).toEqual({ start: 2, end: 6 })
        expect(matchText("ʻAna", "ana")).toEqual({ start: 1, end: 4 })
    })

    it("keeps a decomposed accent inside the mark, and outside it when it comes before", () => {
        const decomposed = "Māui"
        expect(matchText(decomposed, "ma")).toEqual({ start: 0, end: 3 })
        expect(matchText(decomposed, "ui")).toEqual({ start: 3, end: 5 })
    })

    it("prefers a match at a word's start to an earlier one inside a word", () => {
        expect(matchText("Hana Ana", "an")).toEqual({ start: 5, end: 7 })
        expect(matchText("mika@idp.aotearoa.nz", "ao")).toEqual({ start: 9, end: 11 })
    })

    it("falls back to the first match inside a word", () => {
        expect(matchText("Hana", "an")).toEqual({ start: 1, end: 3 })
    })

    it("reads the query as typed in the search field", () => {
        expect(matchText("Mika", " @mik ")).toEqual({ start: 0, end: 3 })
    })

    it("finds nothing for text that isn't there, or for an empty query", () => {
        expect(matchText("Mika", "tama")).toBeNull()
        expect(matchText("Mika", "")).toBeNull()
        expect(matchText("Mika", "'")).toBeNull()
    })
})

describe("searchConversations", () => {
    it("finds friends by name or by address", () => {
        expect(searchConversations(sources(), "ana").people.map((hit) => [hit.item, hit.field])).toEqual([
            [ana, "name"],
            [hana, "name"],
        ])
        expect(searchConversations(sources(), "pacific").people).toEqual([
            { item: ana, field: "address", text: ana.address, match: { start: 9, end: 16 } },
        ])
    })

    it("lists a friend once: their private conversation is the friend's row", () => {
        const { people, conversations } = searchConversations(sources(), "mika")
        expect(people.map((hit) => hit.item)).toEqual([mika])
        expect(conversations.map((hit) => hit.item)).toEqual([working])
    })

    it("lists the private conversations with people who aren't friends", () => {
        expect(searchConversations(sources(), "rangi").conversations).toEqual([
            { item: dmRangi, field: "name", text: "Rangi", match: { start: 0, end: 5 } },
        ])
    })

    it("lists a former friend's conversation once the friendship is gone", () => {
        const { people, conversations } = searchConversations(sources({ friends: [ana, hana] }), "mika")
        expect(people).toEqual([])
        expect(conversations.map((hit) => hit.item)).toEqual([dmMika, working])
    })

    it("finds a group by one of its members' names", () => {
        expect(searchConversations(sources(), "tama").conversations).toEqual([
            { item: working, field: "member", text: "Tama", match: { start: 0, end: 4 } },
        ])
    })

    it("names a group by its own name when that matches as well", () => {
        const named = { ...working, displayName: "Mika's crew" }
        const { conversations } = searchConversations(sources({ conversations: [named] }), "mika")
        expect(conversations.map((hit) => hit.field)).toEqual(["name"])
    })

    it("never finds a group by the address it carries", () => {
        expect(searchConversations(sources(), "aotearoa").conversations).toEqual([])
    })

    it("finds a 1:1 that isn't a friend's by its address", () => {
        const { conversations } = searchConversations(sources(), "pinai.example")
        expect(conversations.map((hit) => [hit.item, hit.field])).toEqual([[dmRangi, "address"]])
    })

    it("takes a row's text matching at a word's start over an earlier one matching inside a word", () => {
        const whanau: Conversation = { ...working, displayName: "Whānau chat", memberNames: ["Ana"] }
        expect(searchConversations(sources({ conversations: [whanau] }), "ana").conversations).toEqual([
            { item: whanau, field: "member", text: "Ana", match: { start: 0, end: 3 } },
        ])

        const tehuia: Friend = { name: "Tehuia", address: "huia@idp.aotearoa.nz" }
        const kahuia: Friend = { name: "Kahuia", address: "kahuia@idp.aotearoa.nz" }
        const { people } = searchConversations(sources({ friends: [kahuia, tehuia] }), "huia")
        expect(people.map((hit) => [hit.item, hit.field])).toEqual([
            [tehuia, "address"],
            [kahuia, "name"],
        ])
    })

    it("ranks matches at a word's start first, then keeps the list's order", () => {
        const kahu: Friend = { name: "Kahu", address: "kahu@idp.aotearoa.nz" }
        const huria: Friend = { name: "Hūria", address: "huria@idp.aotearoa.nz" }
        const mahuika: Friend = { name: "Mahuika", address: "mahuika@idp.aotearoa.nz" }
        const ahu: Friend = { name: "Ahu", address: "ahu@idp.aotearoa.nz" }
        const { people } = searchConversations(sources({ friends: [kahu, huria, mahuika, ahu] }), "hu")
        expect(people.map((hit) => hit.item)).toEqual([huria, kahu, mahuika, ahu])
    })

    it("finds servers and their channels", () => {
        expect(searchConversations(sources(), "aotearoa").places).toEqual([
            { item: { kind: "server", server: aotearoa }, field: "name", text: aotearoa.name, match: { start: 0, end: 8 } },
        ])
        expect(searchConversations(sources(), "loun").places).toEqual([
            {
                item: { kind: "channel", server: aotearoa, channel: lounge },
                field: "name",
                text: "lounge",
                match: { start: 0, end: 4 },
            },
        ])
    })

    it("puts the servers before the channels when they match alike", () => {
        const assembly: Server = { id: "assembly", name: "General assembly" }
        const { places } = searchConversations(sources({ servers: [{ server: assembly, channels: [general] }] }), "gen")
        expect(places.map((hit) => hit.item)).toEqual([
            { kind: "server", server: assembly },
            { kind: "channel", server: assembly, channel: general },
        ])
    })

    it("drops one leading # or @, and the spaces around the query", () => {
        expect(searchConversations(sources(), "#gen").places.map((hit) => hit.text)).toEqual(["general"])
        expect(searchConversations(sources(), "@ana").people.map((hit) => hit.item)).toEqual([ana, hana])
        expect(searchConversations(sources(), " mika ").people.map((hit) => hit.item)).toEqual([mika])
        expect(searchConversations(sources(), "##gen").places).toEqual([])
        expect(searchConversations(sources(), "@@ana").people).toEqual([])
    })

    it("finds nothing for a blank query", () => {
        for (const query of ["", "   ", "#", "@"]) {
            expect(searchConversations(sources(), query)).toEqual({ people: [], conversations: [], places: [] })
        }
    })
})
