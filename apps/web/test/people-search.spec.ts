import { describe, expect, it, vi } from "vitest"

import {
    changesRelation,
    findsNobody,
    nameMatch,
    searchMode,
    shownRelation,
    type PeopleFound,
    type Person,
} from "@pinai/domain/models/people-search"
import type { ISocialPort } from "@pinai/domain/ports/social.port"
import { lookupAddressUseCase } from "@pinai/domain/usecases/social/lookup-address.usecase"
import { searchPeopleUseCase } from "@pinai/domain/usecases/social/search-people.usecase"

const IDP = "http://localhost:8080"

const kai: Person = {
    actor_uri: "https://moana.social/users/kai_ab3xz",
    address: "kai_ab3xz@moana.social",
    display_name: "Kai",
    avatar_url: null,
    relation: "none",
    friendship_id: null,
}

describe("searchMode", () => {
    it("waits for 2 characters before searching names", () => {
        for (const text of ["", "   ", "k", " k ", "\u014d"]) {
            expect(searchMode(text), JSON.stringify(text)).toEqual({ kind: "intro" })
        }
        expect(searchMode("ka")).toEqual({ kind: "names", query: "ka" })
        expect(searchMode(" H\u014dk\u016b ")).toEqual({ kind: "names", query: "H\u014dk\u016b" })
    })

    it("counts no combining mark toward the 2 characters, as the IdP counts them", () => {
        for (const text of ["\u0301\u0301", "o\u0304", "o\u0304\u0301"]) {
            expect(searchMode(text), JSON.stringify(text)).toEqual({ kind: "intro" })
        }
        expect(searchMode("o\u0304k")).toEqual({ kind: "names", query: "o\u0304k" })
    })

    it("reads any @ as an address, however short", () => {
        expect(searchMode("@")).toEqual({ kind: "address-incomplete" })
        expect(searchMode("k@")).toEqual({ kind: "address-incomplete" })
    })

    it("waits for something before the @", () => {
        for (const text of ["@kai", "@kai_ab3xz", " @moana.social"]) {
            expect(searchMode(text), text).toEqual({ kind: "address-incomplete" })
        }
    })

    it("waits for a complete domain after the @", () => {
        for (const text of [
            "kai_ab3xz@",
            "kai_ab3xz@moana",
            "kai_ab3xz@moana.",
            "kai_ab3xz@.social",
            "kai_ab3xz@moana..social",
            "kai_ab3xz@-moana.social",
            "kai_ab3xz@moana.social:",
            "kai_ab3xz@moana.social:0",
            "kai_ab3xz@moana.social:65536",
            "kai_ab3xz@localhost:",
            "kai_ab3xz@moana.social@",
            "kai_ab3xz@moana social",
        ]) {
            expect(searchMode(text), text).toEqual({ kind: "address-incomplete" })
        }
    })

    it("looks up a complete address, its domain as the instance reads it", () => {
        expect(searchMode("kai_ab3xz@moana.social")).toEqual({
            kind: "address",
            address: "kai_ab3xz@moana.social",
            domain: "moana.social",
        })
        expect(searchMode(" kai_ab3xz@Moana.Social ")).toEqual({
            kind: "address",
            address: "kai_ab3xz@moana.social",
            domain: "moana.social",
        })
        expect(searchMode("kai_ab3xz@moana-chat.social")).toEqual({
            kind: "address",
            address: "kai_ab3xz@moana-chat.social",
            domain: "moana-chat.social",
        })
        expect(searchMode("tiare_9qk2m@chat.reef.example:8443")).toMatchObject({ domain: "chat.reef.example:8443" })
    })

    it("takes a dev instance on localhost, with or without its port", () => {
        expect(searchMode("alice_x7k2p@localhost:8080")).toEqual({
            kind: "address",
            address: "alice_x7k2p@localhost:8080",
            domain: "localhost:8080",
        })
        expect(searchMode("alice_x7k2p@localhost")).toMatchObject({ kind: "address", domain: "localhost" })
        expect(searchMode("alice_x7k2p@127.0.0.1:8080")).toMatchObject({ kind: "address", domain: "127.0.0.1:8080" })
    })

    it("drops one leading @, as other fediverse apps write an address", () => {
        expect(searchMode("@kai_ab3xz@moana.social")).toEqual({
            kind: "address",
            address: "kai_ab3xz@moana.social",
            domain: "moana.social",
        })
        expect(searchMode("@@kai_ab3xz@moana.social")).toEqual({ kind: "address-incomplete" })
    })
})

describe("nameMatch", () => {
    it("ignores accents both ways", () => {
        expect(nameMatch("H\u014dk\u016b", "hoku")).toEqual({ start: 0, end: 4 })
        expect(nameMatch("Hoku Lani", "H\u014dk\u016b")).toEqual({ start: 0, end: 4 })
        expect(nameMatch("Teva M\u014dana", "moa")).toEqual({ start: 5, end: 8 })
    })

    it("keeps a decomposed accent inside the mark", () => {
        expect(nameMatch("Ho\u0304ku\u0304", "hoku")).toEqual({ start: 0, end: 6 })
    })

    it("folds the letters unaccent spells out, as the IdP's search does", () => {
        expect(nameMatch("Ægir", "aegir")).toEqual({ start: 0, end: 4 })
        expect(nameMatch("Sigurðr Þorsson", "thors")).toEqual({ start: 8, end: 12 })
    })

    it("takes the query as the IdP does: trimmed, a leading # kept", () => {
        expect(nameMatch("Kai Moana", " kai ")).toEqual({ start: 0, end: 3 })
        expect(nameMatch("Kai #1 fan", "#1")).toEqual({ start: 4, end: 6 })
    })

    it("marks nothing when only the handle matched", () => {
        expect(nameMatch("Mahealani", "q1x8c")).toBeNull()
    })
})

describe("findsNobody", () => {
    it("is a query the IdP refuses: over 100 characters, or a control character", () => {
        expect(findsNobody("a".repeat(100))).toBe(false)
        expect(findsNobody("\u014d".repeat(100))).toBe(false)
        expect(findsNobody("a".repeat(101))).toBe(true)
        expect(findsNobody("ab\u0301".repeat(34))).toBe(true)
        expect(findsNobody("a\tb")).toBe(true)
        expect(findsNobody("a\u007fb")).toBe(true)
    })
})

describe("changesRelation", () => {
    it("is a push after which someone found may stand otherwise with the user", () => {
        for (const type of ["friend_request", "friend_accepted", "friend_removed", "blocks_updated"] as const) {
            expect(changesRelation(type), type).toBe(true)
        }
        for (const type of ["friend_profile_updated", "new_dm", "presence_update", "member_added"] as const) {
            expect(changesRelation(type), type).toBe(false)
        }
    })
})

describe("shownRelation", () => {
    it("is the IdP's word while the user did nothing", () => {
        for (const relation of ["none", "friend", "request_sent", "request_received", "blocked"] as const) {
            expect(shownRelation(relation, undefined)).toBe(relation)
        }
    })

    it("shows an Add or an Accept under way, then answered", () => {
        expect(shownRelation("none", { kind: "add", from: "none", answered: false })).toBe("sending")
        expect(shownRelation("none", { kind: "add", from: "none", answered: true })).toBe("request_sent")
        expect(shownRelation("request_received", { kind: "accept", from: "request_received", answered: false })).toBe(
            "accepting",
        )
        expect(shownRelation("request_received", { kind: "accept", from: "request_received", answered: true })).toBe(
            "friend",
        )
    })

    it("lets a later answer of the IdP's win over an answered action", () => {
        expect(shownRelation("friend", { kind: "add", from: "none", answered: true })).toBe("friend")
        expect(shownRelation("blocked", { kind: "accept", from: "request_received", answered: true })).toBe("blocked")
    })
})

function socialPort(overrides: Partial<ISocialPort>): ISocialPort {
    return {
        searchPeople: vi.fn().mockResolvedValue({ server: [], groups: [] }),
        lookupAddress: vi.fn().mockResolvedValue({ kind: "not-found" }),
        ...overrides,
    } as unknown as ISocialPort
}

describe("searchPeopleUseCase", () => {
    it("searches the names with the query trimmed, and answers both sections", async () => {
        const found: PeopleFound = { server: [kai], groups: [{ ...kai, group: "Federation lab" }] }
        const port = socialPort({ searchPeople: vi.fn().mockResolvedValue(found) })

        expect(await searchPeopleUseCase(IDP, "tok", "  kai ", port)).toBe(found)
        expect(port.searchPeople).toHaveBeenCalledWith(IDP, "tok", "kai")
    })

    it("asks nothing for text that isn't a search by name", async () => {
        const port = socialPort({})

        for (const text of ["k", "kai@", "kai_ab3xz@moana.social"]) {
            await expect(searchPeopleUseCase(IDP, "tok", text, port)).rejects.toThrow("Not a search by name")
        }
        expect(port.searchPeople).not.toHaveBeenCalled()
    })

    it("finds nobody, without asking, for a query the IdP would refuse", async () => {
        const port = socialPort({})

        expect(await searchPeopleUseCase(IDP, "tok", "a".repeat(101), port)).toEqual({ server: [], groups: [] })
        expect(await searchPeopleUseCase(IDP, "tok", "kai\tmoana", port)).toEqual({ server: [], groups: [] })
        expect(port.searchPeople).not.toHaveBeenCalled()
    })
})

describe("lookupAddressUseCase", () => {
    it("looks the address up as read, and answers what the instance said", async () => {
        const port = socialPort({ lookupAddress: vi.fn().mockResolvedValue({ kind: "found", person: kai }) })

        expect(await lookupAddressUseCase(IDP, "tok", " @kai_ab3xz@Moana.Social ", port)).toEqual({
            kind: "found",
            person: kai,
        })
        expect(port.lookupAddress).toHaveBeenCalledWith(IDP, "tok", "kai_ab3xz@moana.social")
    })

    it("asks nothing for an address that isn't complete", async () => {
        const port = socialPort({})

        for (const text of ["@kai", "kai@", "kai@moana", "kai"]) {
            await expect(lookupAddressUseCase(IDP, "tok", text, port)).rejects.toThrow("Not a complete address")
        }
        expect(port.lookupAddress).not.toHaveBeenCalled()
    })
})
