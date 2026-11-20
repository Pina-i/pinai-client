import { instanceAddress, instanceResolution, type InstanceInfo } from "@pinai/domain/models/instance"
import { describe, expect, it } from "vitest"
import { goToRow, instanceRows, type RecentInstance } from "../src/presentation/pages/server/server-choices"

const aotearoa = instanceAddress("aotearoa.nz")!
const reef = instanceAddress("reef.chat")!
const open: InstanceInfo = { name: "Aotearoa", users: 1204, openRegistrations: true }
const invite: InstanceInfo = { name: "Reef", users: 9310, openRegistrations: false }
const recents: RecentInstance[] = [
    { address: aotearoa, info: open },
    { address: reef, info: invite },
]

describe("goToRow", () => {
    it("shows nothing until something is typed, nor for a recent instance typed out", () => {
        expect(goToRow("", instanceResolution("", null), recents)).toBeNull()
        expect(goToRow("reef.chat", instanceResolution("reef.chat", null), recents)).toBeNull()
    })

    it("words what is known of the address typed, ready only for a Pīna'i instance", () => {
        const kauai = instanceAddress("kauai.studio")!
        const info: InstanceInfo = { name: "Kauai", users: null, openRegistrations: true }
        expect(goToRow("kauai", instanceResolution("kauai", null), recents)).toEqual({
            host: "kauai",
            meta: "keep typing — a server looks like name.tld",
            ready: null,
        })
        expect(goToRow("kauai.studio", instanceResolution("kauai.studio", null), recents)).toEqual({
            host: "kauai.studio",
            meta: "checking…",
            ready: null,
        })
        expect(goToRow("kauai.studio", instanceResolution("kauai.studio", { origin: kauai.origin, info: null }), recents)).toEqual({
            host: "kauai.studio",
            meta: "no Pīna'i server here",
            ready: null,
        })
        expect(goToRow("kauai.studio", instanceResolution("kauai.studio", { origin: kauai.origin, info }), recents)).toEqual({
            host: "kauai.studio",
            meta: "open this server",
            ready: { address: kauai, info },
        })
    })
})

describe("instanceRows", () => {
    it("lists the recent instances, each by its name and whether it is open", () => {
        expect(instanceRows("", recents)).toEqual({
            title: "Recent",
            rows: [
                { address: aotearoa, name: "Aotearoa", initial: "A", meta: "aotearoa.nz · open", info: open },
                { address: reef, name: "Reef", initial: "R", meta: "reef.chat · invite only", info: invite },
            ],
        })
    })

    it("narrows them to the matches of what is typed, by host or name", () => {
        expect(instanceRows("REE", recents).rows.map((row) => row.name)).toEqual(["Reef"])
        expect(instanceRows("aot", recents)).toMatchObject({ title: "Matches", rows: [{ name: "Aotearoa" }] })
    })

    it("names an instance by its host until it answers, and says when it doesn't", () => {
        const rows = instanceRows("", [
            { address: aotearoa, info: undefined },
            { address: reef, info: null },
        ]).rows

        expect(rows.map((row) => [row.name, row.meta])).toEqual([
            ["aotearoa.nz", "aotearoa.nz · …"],
            ["reef.chat", "reef.chat · not answering"],
        ])
    })
})
