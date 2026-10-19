/**
 * The landing resolves what the user types to an instance before Continue:
 * an address, then its NodeInfo, then the line under the field. The "Recent"
 * chips are the instances this device signed in to.
 */
import { describe, expect, it } from "vitest"

import {
    addRecentInstance,
    describeInstance,
    displayAddress,
    instanceAddress,
    nodeInfoHref,
    parseNodeInfo,
    parseRecentInstances,
    type InstanceAddress,
} from "@pinai/domain/models/instance"
import type { INodeInfoPort, IRecentInstancesPort } from "@pinai/domain/ports/instance.port"
import { resolveInstanceUseCase } from "@pinai/domain/usecases/instance/resolve-instance.usecase"
import {
    loadRecentInstancesUseCase,
    rememberInstanceUseCase,
} from "@pinai/domain/usecases/instance/recent-instances.usecase"

const AOTEAROA: InstanceAddress = { origin: "https://aotearoa.nz", host: "aotearoa.nz" }
const LOCAL: InstanceAddress = { origin: "http://localhost:8080", host: "localhost:8080" }
const SCHEMA_21 = "http://nodeinfo.diaspora.software/ns/schema/2.1"
const SCHEMA_20 = "http://nodeinfo.diaspora.software/ns/schema/2.0"

function nodeInfo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        version: "2.1",
        software: { name: "pinai", version: "0.1.0" },
        protocols: ["activitypub"],
        services: { inbound: [], outbound: [] },
        openRegistrations: true,
        usage: { users: { total: 1204 } },
        metadata: { nodeName: "Aotearoa" },
        ...overrides,
    }
}

describe("instanceAddress", () => {
    it("takes a bare host as https, and a loopback one as the http of a development instance", () => {
        expect(instanceAddress("aotearoa.nz")).toEqual(AOTEAROA)
        expect(instanceAddress("  Aotearoa.NZ/ ")).toEqual(AOTEAROA)
        expect(instanceAddress("localhost:8080")).toEqual(LOCAL)
        expect(instanceAddress("127.0.0.1:8081")).toEqual({ origin: "http://127.0.0.1:8081", host: "127.0.0.1:8081" })
    })

    it("keeps the scheme it is given, and drops any path", () => {
        expect(instanceAddress("http://localhost:8080")).toEqual(LOCAL)
        expect(instanceAddress("http://idp.example.test/login")).toEqual({
            origin: "http://idp.example.test",
            host: "idp.example.test",
        })
    })

    it("is not an address until it names a host with a top-level name or a port", () => {
        for (const input of ["", "   ", "aotearoa", "localhost", "ftp://aotearoa.nz", "https://user:pw@aotearoa.nz", "a b.nz"]) {
            expect(instanceAddress(input), input).toBeNull()
        }
    })
})

describe("displayAddress", () => {
    it("writes the bare host back when its scheme is the one a bare host gets", () => {
        expect(displayAddress(AOTEAROA)).toBe("aotearoa.nz")
        expect(displayAddress(LOCAL)).toBe("localhost:8080")
    })

    it("keeps the scheme otherwise, so the field resolves to the same origin", () => {
        const plain = { origin: "http://idp.example.test", host: "idp.example.test" }
        expect(displayAddress(plain)).toBe("http://idp.example.test")
        expect(instanceAddress(displayAddress(plain))).toEqual(plain)
    })
})

describe("nodeInfoHref", () => {
    it("follows the 2.1 link, else the 2.0 one, resolving it against the instance", () => {
        const links = {
            links: [
                { rel: SCHEMA_20, href: "https://aotearoa.nz/nodeinfo/2.0" },
                { rel: SCHEMA_21, href: "/nodeinfo/2.1" },
            ],
        }
        expect(nodeInfoHref(links, AOTEAROA.origin)).toBe("https://aotearoa.nz/nodeinfo/2.1")
        expect(nodeInfoHref({ links: [links.links[0]] }, AOTEAROA.origin)).toBe("https://aotearoa.nz/nodeinfo/2.0")
    })

    it("finds nothing in a document without a schema it reads, or with a link that isn't http(s)", () => {
        expect(nodeInfoHref(null, AOTEAROA.origin)).toBeNull()
        expect(nodeInfoHref({ links: [{ rel: "other", href: "/x" }] }, AOTEAROA.origin)).toBeNull()
        expect(nodeInfoHref({ links: [{ rel: SCHEMA_21, href: "javascript:alert(1)" }] }, AOTEAROA.origin)).toBeNull()
    })
})

describe("parseNodeInfo", () => {
    it("reads the name, the count of accounts and whether anyone may register", () => {
        expect(parseNodeInfo(nodeInfo(), AOTEAROA)).toEqual({ name: "Aotearoa", users: 1204, openRegistrations: true })
        expect(parseNodeInfo(nodeInfo({ openRegistrations: false }), AOTEAROA)?.openRegistrations).toBe(false)
    })

    it("names the instance by its host when it gives no name, and leaves out a count it doesn't give", () => {
        expect(parseNodeInfo(nodeInfo({ metadata: {}, usage: {} }), LOCAL)).toEqual({
            name: "localhost:8080",
            users: null,
            openRegistrations: true,
        })
    })

    it("takes nothing from software other than a Pīna'i identity provider", () => {
        expect(parseNodeInfo(nodeInfo({ software: { name: "mastodon", version: "4.3.0" } }), AOTEAROA)).toBeNull()
        expect(parseNodeInfo("not json", AOTEAROA)).toBeNull()
    })
})

describe("describeInstance", () => {
    it("says what resolved, how many people are there and when it takes invitations only", () => {
        expect(describeInstance({ name: "Aotearoa", users: 1204, openRegistrations: true })).toBe(
            "✓ resolved · Aotearoa · 1,204 people",
        )
        expect(describeInstance({ name: "Kauai Studio", users: 1, openRegistrations: false })).toBe(
            "✓ resolved · Kauai Studio · 1 person · invite only",
        )
        expect(describeInstance({ name: "localhost:8080", users: 0, openRegistrations: true })).toBe(
            "✓ resolved · localhost:8080",
        )
    })
})

describe("resolveInstanceUseCase", () => {
    function port(links: unknown, document: unknown): INodeInfoPort & { asked: string[] } {
        const asked: string[] = []
        return {
            asked,
            links: async (origin) => {
                asked.push(origin)
                return links
            },
            document: async (href) => {
                asked.push(href)
                return document
            },
        }
    }

    it("follows the instance's own link to its document", async () => {
        const nodeInfoPort = port({ links: [{ rel: SCHEMA_21, href: "https://aotearoa.nz/nodeinfo/2.1" }] }, nodeInfo())
        expect(await resolveInstanceUseCase(AOTEAROA, nodeInfoPort)).toEqual({
            name: "Aotearoa",
            users: 1204,
            openRegistrations: true,
        })
        expect(nodeInfoPort.asked).toEqual(["https://aotearoa.nz", "https://aotearoa.nz/nodeinfo/2.1"])
    })

    it("resolves to nothing without a link, and never fetches a document then", async () => {
        const nodeInfoPort = port({ links: [] }, nodeInfo())
        expect(await resolveInstanceUseCase(AOTEAROA, nodeInfoPort)).toBeNull()
        expect(nodeInfoPort.asked).toEqual(["https://aotearoa.nz"])
    })
})

describe("recent instances", () => {
    const reef = { origin: "https://reef.chat", host: "reef.chat" }
    const kauai = { origin: "https://kauai.studio", host: "kauai.studio" }

    it("puts the latest first, once, and keeps three", () => {
        expect(addRecentInstance([AOTEAROA, reef], reef)).toEqual([reef, AOTEAROA])
        expect(addRecentInstance([AOTEAROA, reef, kauai], LOCAL)).toEqual([LOCAL, AOTEAROA, reef])
    })

    it("reads back only addresses, once each", () => {
        expect(parseRecentInstances(["https://aotearoa.nz", 42, "nonsense", "https://aotearoa.nz/", "http://localhost:8080"])).toEqual([
            AOTEAROA,
            LOCAL,
        ])
        expect(parseRecentInstances({ not: "a list" })).toEqual([])
    })

    it("are remembered from the IdP URL a sign-in finished on", () => {
        let stored: unknown = ["https://reef.chat"]
        const store: IRecentInstancesPort = {
            read: () => stored,
            write: (origins) => {
                stored = origins
            },
        }
        rememberInstanceUseCase("http://localhost:8080", store)
        expect(stored).toEqual(["http://localhost:8080", "https://reef.chat"])
        expect(loadRecentInstancesUseCase(store)).toEqual([LOCAL, reef])
    })
})
