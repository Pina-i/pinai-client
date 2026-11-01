/**
 * The GIF picker searches with the Klipy key the signed-in instance hands out in its NodeInfo, and
 * no other.
 */
import { describe, expect, it } from "vitest"

import { klipyKey, nodeInfoKlipyKey } from "@pinai/domain/models/gif-search"
import type { INodeInfoPort } from "@pinai/domain/ports/instance.port"
import { gifSearchKeyUseCase } from "@pinai/domain/usecases/instance/gif-search-key.usecase"

const SCHEMA_21 = "http://nodeinfo.diaspora.software/ns/schema/2.1"

function nodeInfo(metadata: Record<string, unknown>, software = "pinai"): Record<string, unknown> {
    return { version: "2.1", software: { name: software }, metadata }
}

const KLIPY = { gifs: { provider: "klipy", apiKey: "instance-key_1" } }

describe("klipyKey", () => {
    it("takes letters, digits, - and _, trimmed", () => {
        expect(klipyKey(" Ab3-x_9 ")).toBe("Ab3-x_9")
    })

    it("refuses what would need escaping in a URL path, nothing, or no string", () => {
        for (const raw of ["", "  ", "a/b", "a?b", "a b", "clé", "x".repeat(257), null, 42]) {
            expect(klipyKey(raw), String(raw)).toBeNull()
        }
    })
})

describe("nodeInfoKlipyKey", () => {
    it("reads the key a Pīna'i instance hands out", () => {
        expect(nodeInfoKlipyKey(nodeInfo(KLIPY))).toBe("instance-key_1")
    })

    it("is null without one, for another provider, or from software that isn't Pīna'i", () => {
        expect(nodeInfoKlipyKey(nodeInfo({ nodeName: "Aotearoa" }))).toBeNull()
        expect(nodeInfoKlipyKey(nodeInfo({ gifs: { provider: "giphy", apiKey: "k" } }))).toBeNull()
        expect(nodeInfoKlipyKey(nodeInfo({ gifs: { provider: "klipy", apiKey: "a/b" } }))).toBeNull()
        expect(nodeInfoKlipyKey(nodeInfo(KLIPY, "mastodon"))).toBeNull()
        expect(nodeInfoKlipyKey("not json")).toBeNull()
    })
})

describe("gifSearchKeyUseCase", () => {
    function port(document: unknown): INodeInfoPort {
        return {
            links: async () => ({ links: [{ rel: SCHEMA_21, href: "/nodeinfo/2.1" }] }),
            document: async () => document,
        }
    }

    it("is the key the instance's NodeInfo hands out", async () => {
        await expect(gifSearchKeyUseCase("https://aotearoa.nz", port(nodeInfo(KLIPY)))).resolves.toBe("instance-key_1")
    })

    it("is null for an instance that hands out none, or for no address", async () => {
        await expect(gifSearchKeyUseCase("https://aotearoa.nz", port(nodeInfo({})))).resolves.toBeNull()
        await expect(gifSearchKeyUseCase("not an address", port(nodeInfo(KLIPY)))).resolves.toBeNull()
    })

    it("rejects when the instance can't be read, so it is asked again", async () => {
        const down: INodeInfoPort = {
            links: async () => {
                throw new Error("offline")
            },
            document: async () => ({}),
        }
        await expect(gifSearchKeyUseCase("https://aotearoa.nz", down)).rejects.toThrow("offline")
    })
})
