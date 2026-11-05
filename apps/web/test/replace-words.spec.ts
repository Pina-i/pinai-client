/**
 * Replacing the words on a device that holds them (the design's 18i3; `identity-provider/specs/e2ee.md
 * § 2`, § 6.6, § 6.11): only a device that acts, never while a restore is due or the cache unread, the
 * password typed recently checked before anything is minted, the archive brought onto this device
 * before it is erased, then the start over's flow over the generation held — generation n+1 minted as
 * pending and set, kept and marked to show, approved, reported, shared with the handshake partners —
 * and the re-archive marked due under it, by whoever promotes the words: a conflict or a `401` erases
 * the pending key and keeps nothing, and so does a generation that moved meanwhile. Pressed again
 * after a lost answer, the words the IdP took are kept. The device goes on acting and answers the
 * other devices' requests; the old words give the key in force no more. Real E2EE engines over fakes
 * keeping the IdP's rules.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { mayAnswer } from "@pinai/domain/models/approval-handshake"
import { archivedText, type RestoredMessage } from "@pinai/domain/models/history-archive"
import { passphraseVerdict } from "@pinai/domain/models/history-key"
import { acceptHistoryShareUseCase } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { checkHistoryKeyUseCase } from "@pinai/domain/usecases/e2ee/check-history-key.usecase"
import { replaceWordsUseCase, type ReplaceWordsDeps } from "@pinai/domain/usecases/e2ee/replace-words.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"

import { accessToken } from "./setup/access-token"
import { ACTOR, FakeHistoryIdp, IDP, historyDevice } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"
import { bundleHpke, sharingAccount, type SharingDevice } from "./setup/key-shares"

const issuers = new FakeIssuers()
let hpke: MlsAdapter

beforeAll(async () => {
    hpke = await bundleHpke()
})

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    brought.length = 0
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

type Device = ReturnType<typeof historyDevice>

const C1 = "11112222-3333-4444-5555-666677778888"
const SAVED = "00000000-0000-4000-8000-000000000001"

/** An account whose laptop set generation 1 and saved some history under it — a message only the archive still holds. */
async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop")
    const founded = await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    if (founded.kind !== "holds") throw new Error("the first device didn't set the key")
    laptop.e2ee.startFlushing(IDP, () => laptop.token)
    laptop.e2ee.bufferForArchive(C1, SAVED, archivedText({ address: "bob_a1b2c@idp.test" }, "2026-11-01T00:00:00Z", { text: "from the phone" }, undefined))
    await laptop.e2ee["flushArchiveNow"]()
    laptop.e2ee.stopFlushing()
    idp.log.length = 0
    return { idp, laptop, oldWords: founded.words }
}

/** What the restore before the `PUT` brought into the device's cache, noted on the IdP's timeline. */
const brought: RestoredMessage[][] = []

function replaceDeps(device: Device | SharingDevice, extra: Partial<ReplaceWordsDeps> = {}): ReplaceWordsDeps {
    return {
        ...device.deps,
        cacheRead: () => true,
        applyRestored: async (messages) => {
            brought.push(messages)
            device.storage.log.push("bring the archive")
        },
        ...extra,
    }
}

const replace = (device: Device | SharingDevice, tokenArrivedAt: number | null = Date.now(), extra: Partial<ReplaceWordsDeps> = {}) =>
    replaceWordsUseCase(replaceDeps(device, extra))({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR, tokenArrivedAt })

const accept = (device: SharingDevice) => acceptHistoryShareUseCase(device.deps)(IDP, device.token, ACTOR)

describe("replacing the words", () => {
    it("with a recent password: generation n+1 set — the archive erased —, its words kept, shown and approved, the re-archive due under it", async () => {
        const { idp, laptop, oldWords } = await account()

        const outcome = await replace(laptop)

        expect(outcome).toEqual({ kind: "replaced", generation: 2, words: laptop.storage.kept?.words })
        expect(laptop.storage.kept?.words).not.toEqual(oldWords)
        expect(idp.key).toMatchObject({ generation: 2, setByDevice: laptop.storage.deviceId })
        expect(idp.archive.size).toBe(0)
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })
        expect(laptop.storage.newWords).toBe(2)
        expect(await laptop.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(idp.reports.get(laptop.storage.deviceId)).toBe(2)
        // Marked before the words are kept: words kept unmarked would never be archived under.
        expect(idp.log.indexOf("seal pending 2")).toBeLessThan(idp.log.indexOf("set key 2"))
        expect(idp.log.indexOf("set key 2")).toBeLessThan(idp.log.indexOf("save words 2"))
    })

    it("brings the archive onto this device before anything is minted, so what only the archive held is saved again", async () => {
        const { idp, laptop } = await account()

        expect(await replace(laptop)).toMatchObject({ kind: "replaced", generation: 2 })

        expect(brought).toHaveLength(1)
        expect(brought[0].map((m) => [m.id, m.text])).toEqual([[SAVED, "from the phone"]])
        expect(idp.log.indexOf("read archive")).toBeLessThan(idp.log.indexOf("bring the archive"))
        expect(idp.log.indexOf("bring the archive")).toBeLessThan(idp.log.indexOf("seal pending 2"))
    })

    it("an archive it can't bring first stops it: nothing minted, the old words kept", async () => {
        const { idp, laptop } = await account()
        const held = laptop.storage.kept
        vi.spyOn(idp, "downloadPage").mockRejectedValueOnce(new TypeError("Failed to fetch"))

        expect(await replace(laptop)).toEqual({ kind: "restore-failed", error: expect.any(TypeError) })
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.storage.kept).toEqual(held)
        expect(idp.key?.generation).toBe(1)
    })

    it("refuses while this page load's cache isn't read back, or a restore under the words held isn't applied — before any password", async () => {
        const { idp, laptop } = await account()
        laptop.token = accessToken(Date.now() - 30 * 60_000, "laptop", Date.now())

        expect(await replace(laptop, null, { cacheRead: () => false })).toEqual({ kind: "cache-unread" })
        laptop.storage.restoreDue = { generation: 1, appliedAt: null }
        expect(await replace(laptop, null)).toEqual({ kind: "restore-due" })
        expect(idp.log.filter((line) => line.startsWith("seal pending"))).toEqual([])
        expect(brought).toEqual([])

        // Applied, waiting for the next page load to confirm it: its messages are in the cache already.
        laptop.storage.restoreDue = { generation: 1, appliedAt: "2026-11-05T10:00:00Z" }
        expect(await replace(laptop, null)).toEqual({ kind: "recent-sign-in" })
    })

    it("the new words are shown until the user goes past them; pressed again meanwhile, they are answered again — never a second replacement", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        const { idp, laptop } = await account()
        const first = await replace(laptop)
        vi.setSystemTime(Date.now() + 20 * 60_000)
        laptop.token = accessToken(Date.now() - 20 * 60_000)

        expect(await laptop.e2ee.newWordsToShow()).toEqual({ generation: 2, words: laptop.storage.kept?.words })
        expect(await replace(laptop, null)).toEqual(first)
        expect(idp.log.filter((line) => line.startsWith("set key"))).toEqual(["set key 2"])

        await laptop.e2ee.dismissNewWords()
        expect(await laptop.e2ee.newWordsToShow()).toBeNull()
        expect(laptop.storage.newWords).toBeNull()
    })

    it("with a password typed too long ago: mints nothing, sets nothing; signed in again and confirmed again, it replaces them", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        const { idp, laptop } = await account()
        const held = laptop.storage.kept
        const arrived = Date.now()
        vi.setSystemTime(arrived + 9 * 60_000 + 1_000)

        expect(await replace(laptop, arrived)).toEqual({ kind: "recent-sign-in" })
        expect(idp.log.filter((line) => line.startsWith("seal pending") || line.startsWith("set key"))).toEqual([])
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.storage.kept).toEqual(held)
        expect(laptop.storage.rearchiveDue).toBeNull()

        laptop.token = accessToken(Date.now())
        expect(await replace(laptop)).toMatchObject({ kind: "replaced", generation: 2 })
    })

    it("a 401 asking for the password anyway erases the pending key, and keeps and marks nothing", async () => {
        const { idp, laptop } = await account()
        const held = laptop.storage.kept
        idp.recentSignIn = () => false

        expect(await replace(laptop)).toEqual({ kind: "recent-sign-in" })
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.storage.kept).toEqual(held)
        expect(laptop.storage.rearchiveDue).toBeNull()
        expect(laptop.storage.newWords).toBeNull()
        expect(idp.key?.generation).toBe(1)
    })

    it("another device setting that generation first: a conflict — the pending key erased, nothing kept, shown or marked", async () => {
        const { idp, laptop } = await account()
        const held = laptop.storage.kept
        const rival = historyDevice(idp, "rival")
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await idp.session().linkDevice(IDP, rival.token, rival.storage.deviceId)
            await FakeHistoryIdp.prototype.setKey.call(idp, IDP, rival.token, (await rival.e2ee.mintHistoryKey(2)).key)
            return FakeHistoryIdp.prototype.setKey.apply(idp, args)
        })

        expect(await replace(laptop)).toEqual({ kind: "conflict" })
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.storage.kept).toEqual(held)
        expect(laptop.storage.rearchiveDue).toBeNull()
        expect(laptop.storage.newWords).toBeNull()
        expect(idp.key?.setByDevice).toBe(rival.storage.deviceId)
    })

    it("a conflict leaves alone a re-archive still due from an earlier replacement", async () => {
        const { idp, laptop } = await account()
        await replace(laptop)
        await laptop.e2ee.dismissNewWords()
        await laptop.e2ee.advanceHistoryRearchive(2, { conversationId: "11112222-3333-4444-5555-666677778888", at: 1, messageId: "00000000-0000-4000-8000-000000000001", part: 0 })
        const due = laptop.storage.rearchiveDue
        idp.recentSignIn = () => false

        expect(await replace(laptop)).toEqual({ kind: "recent-sign-in" })
        expect(laptop.storage.rearchiveDue).toEqual(due)
    })

    it("only a device that acts: one without the current words, or with a key of its own waiting, mints nothing", async () => {
        const { idp, laptop } = await account()
        const fresh = historyDevice(idp, "fresh")
        await idp.session().linkDevice(IDP, fresh.token, fresh.storage.deviceId)

        expect(await replace(fresh)).toEqual({ kind: "not-acting" })
        expect(fresh.storage.pending).toBeNull()

        await laptop.e2ee.mintHistoryKey(2)
        idp.log.length = 0
        expect(await replace(laptop)).toEqual({ kind: "not-acting" })
        expect(idp.log).toEqual([])
        expect(idp.key?.generation).toBe(1)
    })

    it("a failure on the way, the IdP holding the old key: confirmed again, it sends the same words", async () => {
        const { idp, laptop } = await account()
        vi.spyOn(idp, "setKey").mockRejectedValueOnce(new TypeError("Failed to fetch"))
        await expect(replace(laptop)).rejects.toThrow("Failed to fetch")
        const pending = laptop.storage.pending!.words

        expect(await replace(laptop)).toEqual({ kind: "replaced", generation: 2, words: pending })
        expect(idp.key?.generation).toBe(2)
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })
    })

    it("an answer lost on the way, pressed again in the same page: the words the IdP took are kept and shown, the re-archive due", async () => {
        const { idp, laptop } = await account()
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await FakeHistoryIdp.prototype.setKey.apply(idp, args)
            throw new TypeError("Failed to fetch")
        })
        await expect(replace(laptop)).rejects.toThrow("Failed to fetch")
        const pending = laptop.storage.pending!.words
        brought.length = 0

        expect(await replace(laptop)).toEqual({ kind: "replaced", generation: 2, words: pending })
        expect(await laptop.e2ee.newWordsToShow()).toEqual({ generation: 2, words: pending })
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })
        expect(idp.log.filter((line) => line.startsWith("set key"))).toEqual(["set key 2"])
        expect(brought).toEqual([])
    })

    it("another device's replacement landing between its two reads of the key: a conflict — nothing minted over a generation it never held", async () => {
        const { idp, laptop } = await account()
        const tablet = historyDevice(idp, "tablet")
        await idp.session().linkDevice(IDP, tablet.token, tablet.storage.deviceId)
        vi.spyOn(idp, "downloadPage").mockImplementationOnce(async (...args) => {
            await idp.setKey(IDP, tablet.token, (await tablet.e2ee.mintHistoryKey(2)).key)
            return FakeHistoryIdp.prototype.downloadPage.apply(idp, args)
        })

        expect(await replace(laptop)).toEqual({ kind: "conflict" })
        expect(idp.key).toMatchObject({ generation: 2, setByDevice: tablet.storage.deviceId })
        expect(idp.log.filter((line) => line.startsWith("set key"))).toEqual(["set key 2"])
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.storage.rearchiveDue).toBeNull()
    })

    it("an answer lost on the way: the next start keeps the words the IdP took, shows them, and marks the re-archive due", async () => {
        const { idp, laptop } = await account()
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await FakeHistoryIdp.prototype.setKey.apply(idp, args)
            throw new TypeError("Failed to fetch")
        })
        await expect(replace(laptop)).rejects.toThrow("Failed to fetch")
        expect(laptop.storage.pending).toMatchObject({ rearchive: true, key: { generation: 2 } })
        expect(laptop.storage.rearchiveDue).toBeNull()

        const reloaded = historyDevice(idp, "laptop", laptop.storage)
        reloaded.token = laptop.token
        expect(await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })
        expect(await reloaded.e2ee.newWordsToShow()).toMatchObject({ generation: 2 })
    })

    it("an answer that never came, the IdP holding the old key: the next start erases the pending key and its mark", async () => {
        const { idp, laptop } = await account()
        vi.spyOn(idp, "setKey").mockRejectedValueOnce(new TypeError("Failed to fetch"))
        await expect(replace(laptop)).rejects.toThrow("Failed to fetch")
        laptop.storage.pending!.mintedAt = Date.now() - 3 * 60_000

        const reloaded = historyDevice(idp, "laptop", laptop.storage)
        reloaded.token = laptop.token
        expect(await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)).toMatchObject({ kind: "holds", generation: 1 })
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.storage.rearchiveDue).toBeNull()
    })
})

describe("the other devices", () => {
    const enrolledWithToken = async (a: Awaited<ReturnType<typeof sharingAccount>>, name: string) => {
        const made = await a.enrolled(name, "Safari on iPadOS")
        made.token = accessToken(Date.now(), name)
        a.net.alsoSignedIn(made.token, made)
        return made
    }

    it("a handshake partner gets the new words by share, and keeps them", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 1 })
        a.laptop.token = accessToken(Date.now(), "laptop")
        a.net.alsoSignedIn(a.laptop.token, a.laptop)

        expect(await replace(a.laptop)).toMatchObject({ kind: "replaced", generation: 2 })

        expect(a.shares.posted.at(-1)).toEqual({ sender: a.laptop.storage.deviceId, recipient: a.phone.storage.deviceId, generation: 2 })
        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 2 })
        expect(a.phone.storage.kept?.words).toEqual(a.laptop.storage.kept?.words)
    })

    it("the device that replaced them goes on acting, and answers the request of a device that held only the old words", async () => {
        const a = await sharingAccount(hpke, issuers)
        const tablet = await enrolledWithToken(a, "tablet")
        expect(
            await restoreHistoryFromPassphraseUseCase(tablet.deps)({ idpUrl: IDP, accessToken: tablet.token, actorUri: ACTOR, passphrase: a.words }),
        ).toEqual({ kind: "kept", generation: 1 })
        a.laptop.token = accessToken(Date.now(), "laptop")
        a.net.alsoSignedIn(a.laptop.token, a.laptop)

        expect(await replace(a.laptop)).toMatchObject({ kind: "replaced", generation: 2 })
        expect(mayAnswer(await a.laptop.e2ee.historyKeyStanding())).toBe(true)
        const verdict = await a.laptop.e2ee.reviewDevices(IDP, a.laptop.token, ACTOR, [...a.net.rows.values()])
        expect(verdict).toMatchObject({ acting: true, generation: 2 })
        expect(await tablet.e2ee.checkHistoryKey(IDP, tablet.token)).toMatchObject({ kind: "mismatch", reason: "check-value", generation: 2, held: 1 })

        // The tablet asks; the laptop answers through the run its Door and its seats share, then shares.
        await a.handshake(tablet, a.laptop)
        await a.refresh(a.laptop)
        expect(await accept(tablet)).toEqual({ kind: "kept", generation: 2 })
        expect(tablet.storage.kept?.words).toEqual(a.laptop.storage.kept?.words)
    })
})

describe("the old words", () => {
    it("no longer give the key in force: a device holding them is refused, typed they are wrong, and they approve no device", async () => {
        const { idp, laptop, oldWords } = await account()
        const tablet = historyDevice(idp, "tablet")
        await idp.session().linkDevice(IDP, tablet.token, tablet.storage.deviceId)
        expect(
            await restoreHistoryFromPassphraseUseCase(tablet.deps)({ idpUrl: IDP, accessToken: tablet.token, actorUri: ACTOR, passphrase: oldWords }),
        ).toEqual({ kind: "kept", generation: 1 })

        await replace(laptop)

        expect(passphraseVerdict(await laptop.e2ee.deriveHistoryKey(oldWords, idp.key!.salt), idp.key!)).toBe("wrong")
        expect(await tablet.e2ee.checkHistoryKey(IDP, tablet.token)).toMatchObject({ kind: "mismatch", reason: "check-value", generation: 2, held: 1 })
        await expect(tablet.e2ee.signPassphraseApproval(IDP, tablet.token, ACTOR)).rejects.toThrow("holds no current history passphrase")

        const stranger = historyDevice(idp, "stranger")
        await idp.session().linkDevice(IDP, stranger.token, stranger.storage.deviceId)
        expect(
            await restoreHistoryFromPassphraseUseCase(stranger.deps)({ idpUrl: IDP, accessToken: stranger.token, actorUri: ACTOR, passphrase: oldWords }),
        ).toEqual({ kind: "wrong-passphrase" })
        expect(stranger.storage.kept).toBeNull()
        expect(idp.approvals.filter((approval) => approval.generation === 2).map((approval) => approval.deviceId)).toEqual([laptop.storage.deviceId])
    })
})
