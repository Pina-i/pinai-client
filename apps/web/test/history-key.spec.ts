/**
 * The account's history key in generations (`identity-provider/specs/e2ee.md § 3.6–3.9, § 6.1,
 * § 6.4`): the first device setting generation 1 through a pending key, words typed on a device,
 * holding a generation checked against the IdP's key, uploads under a generation and the
 * archive's associated data. Each device is the real E2EE engine against an IdP that answers as
 * the spec says.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { archiveEntryAad } from "@pinai/crypto/canonical-bytes"
import {
    ARCHIVE_BUFFER_LIMIT,
    archivedEdit,
    archivedText,
    editEntryId,
} from "@pinai/domain/models/history-archive"
import {
    approvalCarriedOver,
    parseHistoryKeyStanding,
    passphraseVerdict,
    sameHistoryKey,
    standingAgainst,
    type CurrentHistoryKey,
    type KeptHistoryKey,
} from "@pinai/domain/models/history-key"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { checkHistoryKeyUseCase } from "@pinai/domain/usecases/e2ee/check-history-key.usecase"
import { clearHistoryBackupUseCase } from "@pinai/domain/usecases/e2ee/clear-history-backup.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { startThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/start-this-device.usecase"

import { ACTOR, FakeHistoryIdp, FastSealer, IDP, historyDevice } from "./setup/history-idp"

const SENDER = { address: "alice@idp.test", displayName: "Alice" }
const C1 = "11112222-3333-4444-5555-666677778888"
const C2 = "99998888-7777-6666-5555-444433332222"
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const otherApprovalKey = () => ed25519.getPublicKey(ed25519.utils.randomSecretKey())

type Device = ReturnType<typeof historyDevice>

const flushing: Device[] = []
afterEach(() => {
    for (const device of flushing.splice(0)) device.e2ee.stopFlushing()
    vi.restoreAllMocks()
})

function found(device: Device) {
    return bootstrapFirstDeviceUseCase(device.deps)({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR })
}

function typeWords(device: Device, passphrase: string[]) {
    return restoreHistoryFromPassphraseUseCase(device.deps)({
        idpUrl: IDP,
        accessToken: device.token,
        actorUri: ACTOR,
        passphrase,
    })
}

/** What a page load runs once the session named its device. */
async function startUp(device: Device) {
    await device.deps.sessionPort.linkDevice(IDP, device.token, device.storage.deviceId)
    return checkHistoryKeyUseCase(device.deps)(IDP, device.token, ACTOR)
}

/** An account whose laptop set generation 1. */
async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop")
    const outcome = await found(laptop)
    if (outcome.kind !== "holds") throw new Error("the first device didn't set the key")
    return { idp, laptop, words: outcome.words }
}

/** Another device sets the next generation with words of its own: a start over elsewhere. */
async function startOverElsewhere(idp: FakeHistoryIdp) {
    const other = historyDevice(idp, "elsewhere")
    await idp.session().linkDevice(IDP, other.token, other.storage.deviceId)
    const { words, key } = await other.e2ee.mintHistoryKey((idp.key?.generation ?? 0) + 1)
    await idp.setKey(IDP, other.token, key)
    return { other, words }
}

/** Queues messages for the archive, then runs a flush. */
async function archive(device: Device, ids: number[], conversation = C1) {
    if (!flushing.includes(device)) {
        flushing.push(device)
        device.e2ee.startFlushing(IDP, () => device.token)
    }
    for (const n of ids) {
        const text = archivedText(SENDER, `2026-11-01T10:00:0${n % 10}Z`, { text: `m${n}` }, undefined)
        device.e2ee.bufferForArchive(conversation, id(n), text)
    }
    await device.e2ee["flushArchiveNow"]()
}

const buffered = (device: Device) => device.e2ee["archiveBuffer"].map((e) => e.entryId)

describe("the history key's rules", () => {
    const key: CurrentHistoryKey = {
        generation: 2,
        salt: new Uint8Array(16),
        checkValue: new Uint8Array(32).fill(1),
        approvalPublicKey: new Uint8Array(32).fill(2),
        setByDevice: "d1",
    }
    const root = new Uint8Array(32).fill(9)
    const kept = (change: Partial<KeptHistoryKey> = {}): KeptHistoryKey => ({
        generation: 2,
        salt: key.salt,
        checkValue: key.checkValue,
        approvalPublicKey: key.approvalPublicKey,
        approvedRootKey: root,
        ...change,
    })

    it("holds a key only when both the check value and the approval key are its own", () => {
        const right = { checkValue: key.checkValue, approvalPublicKey: key.approvalPublicKey }
        expect(passphraseVerdict(right, key)).toBe("holds")
        expect(passphraseVerdict({ ...right, checkValue: new Uint8Array(32) }, key)).toBe("wrong")
        expect(passphraseVerdict({ ...right, approvalPublicKey: new Uint8Array(32) }, key)).toBe("key-swapped")
        expect(sameHistoryKey(key, { ...key })).toBe(true)
        expect(sameHistoryKey(key, { ...key, generation: 3 })).toBe(false)
    })

    it("is settled only when approved over the device's root key as it is now", () => {
        expect(standingAgainst(key, kept(), 2, root)).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(standingAgainst(key, kept(), 2, new Uint8Array(32))).toEqual({ kind: "holds", generation: 2, settled: false })
        expect(standingAgainst(key, kept({ approvedRootKey: null }), 2, root)).toMatchObject({ settled: false })
    })

    it("never goes back: a key older than the newest seen, or none after one, is a rollback", () => {
        expect(standingAgainst(key, kept(), 3, root)).toMatchObject({ kind: "mismatch", reason: "rollback", generation: 2 })
        expect(standingAgainst(null, kept(), 2, root)).toMatchObject({ kind: "mismatch", reason: "rollback", generation: 0 })
        expect(standingAgainst(null, null, null, root)).toEqual({ kind: "no-key" })
        expect(standingAgainst(key, null, 2, root)).toEqual({ kind: "no-passphrase", generation: 2 })
    })

    it("words give the generation they were kept for, no other", () => {
        expect(standingAgainst({ ...key, generation: 3 }, kept(), 2, root)).toMatchObject({ reason: "relabelled", held: 2 })
        expect(standingAgainst({ ...key, generation: 3, salt: new Uint8Array(16).fill(5) }, kept(), 2, root)).toMatchObject({
            reason: "check-value",
            setByDevice: "d1",
        })
        expect(standingAgainst(key, kept({ approvalPublicKey: new Uint8Array(32) }), 2, root)).toMatchObject({
            reason: "approval-key",
        })
    })

    it("carries an approval over the same words for the same generation only", () => {
        const previous = { words: ["a", "b"], generation: 2, approvedRootKey: root }
        expect(approvalCarriedOver(previous, ["a", "b"], 2)).toEqual(root)
        expect(approvalCarriedOver(previous, ["a", "c"], 2)).toBeNull()
        expect(approvalCarriedOver(previous, ["a", "b"], 3)).toBeNull()
    })

    it("reads back a standing as recorded, and nothing else", () => {
        const recorded = standingAgainst(null, kept(), 2, root)
        expect(parseHistoryKeyStanding(JSON.parse(JSON.stringify(recorded)))).toEqual(recorded)
        expect(parseHistoryKeyStanding({ kind: "unchecked" })).toBeNull()
        expect(parseHistoryKeyStanding({ kind: "holds", generation: 0, settled: true })).toBeNull()
    })

    it("names an edit by its ciphertext, as a version-8 UUID", () => {
        const digest = sha256(new Uint8Array([1, 2, 3]))
        expect(editEntryId(digest)).toBe(editEntryId(sha256(new Uint8Array([1, 2, 3]))))
        expect(editEntryId(digest)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
        expect(editEntryId(digest)).not.toBe(editEntryId(sha256(new Uint8Array([1, 2, 4]))))
    })
})

describe("the account's first device", () => {
    it("seals its words as pending, sets generation 1, then keeps them, approves itself and reports", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")

        const outcome = await found(laptop)

        expect(idp.log).toEqual([
            "register device",
            "name session",
            "read key",
            "seal pending 1",
            "set key 1",
            "save words 1",
            "erase pending",
            "approve by passphrase 1",
            "report 1",
            "save words 1 approved",
            "key packages",
        ])
        expect(outcome).toEqual({ kind: "holds", words: laptop.storage.kept?.words })
        expect(idp.key?.setByDevice).toBe(laptop.storage.deviceId)
        expect(idp.reports.get(laptop.storage.deviceId)).toBe(1)
        const sealer = new FastSealer()
        const words = laptop.storage.kept!.words
        expect(passphraseVerdict(sealer.derive(await sealer.deriveKey(words, idp.key!.salt)), idp.key!)).toBe("holds")
    })

    it("a lost answer then a reload: the pending key the IdP took is kept, not set again", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await FakeHistoryIdp.prototype.setKey.apply(idp, args)
            throw new Error("network")
        })

        await expect(found(laptop)).rejects.toThrow("network")
        expect(laptop.storage.kept).toBeNull()
        const pending = laptop.storage.pending!.words

        const reloaded = historyDevice(idp, "laptop", laptop.storage)
        expect(await found(reloaded)).toEqual({ kind: "holds", words: pending })
        expect(idp.log.filter((line) => line.startsWith("set key"))).toEqual(["set key 1"])
        expect(laptop.storage.pending).toBeNull()
    })

    it("cut short before its PUT: the next start sets the very key it sealed", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")
        vi.spyOn(idp, "setKey").mockRejectedValueOnce(new Error("closed"))

        await expect(found(laptop)).rejects.toThrow("closed")
        expect(idp.key).toBeNull()
        const pending = laptop.storage.pending!

        const reloaded = historyDevice(idp, "laptop", laptop.storage)
        expect(await found(reloaded)).toEqual({ kind: "holds", words: pending.words })
        expect(sameHistoryKey(idp.key!, pending.key)).toBe(true)
    })

    it("run twice at once on the same device (strict mode): one key, the same words", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")

        const [first, second] = await Promise.all([found(laptop), found(laptop)])

        expect(first).toEqual(second)
        expect(first.kind).toBe("holds")
        expect(idp.log.filter((line) => line.startsWith("set key"))).toEqual(["set key 1"])
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.sealer.derivations).toBe(1)
    })

    it("two founding at once: the loser keeps and shows no words", async () => {
        const idp = new FakeHistoryIdp()
        const a = historyDevice(idp, "a")
        const b = historyDevice(idp, "b")

        const outcomes = await Promise.all([found(a), found(b)])

        expect(outcomes.map((o) => o.kind).sort()).toEqual(["has-key", "holds"])
        const [winner, loser] = outcomes[0].kind === "holds" ? [a, b] : [b, a]
        expect(loser.storage.kept).toBeNull()
        expect(loser.storage.pending).toBeNull()
        expect(idp.key?.setByDevice).toBe(winner.storage.deviceId)
        expect(idp.approvals.map((x) => x.deviceId)).toEqual([winner.storage.deviceId])
    })

    it("a key another device set between its read and its write erases its pending words", async () => {
        const idp = new FakeHistoryIdp()
        const late = historyDevice(idp, "late")
        const rival = historyDevice(idp, "rival")
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await found(rival)
            return FakeHistoryIdp.prototype.setKey.apply(idp, args)
        })

        expect(await found(late)).toEqual({ kind: "has-key" })
        expect(late.storage.kept).toBeNull()
        expect(late.storage.pending).toBeNull()
        expect(idp.key?.setByDevice).toBe(rival.storage.deviceId)
    })

    it("a device without words on an account with a key answers has-key, minting and deriving nothing", async () => {
        const { idp } = await account()
        const phone = historyDevice(idp, "phone")

        expect(await found(phone)).toEqual({ kind: "has-key" })
        expect(phone.sealer.derivations).toBe(0)
        expect(phone.storage.pending).toBeNull()
    })

    it("a device holding the words already shows them again, approving itself only once", async () => {
        const { idp, laptop, words } = await account()
        idp.log.length = 0
        const reloaded = historyDevice(idp, "laptop", laptop.storage)

        expect(await found(reloaded)).toEqual({ kind: "holds", words })
        expect(idp.log).toEqual(["register device", "name session", "read key", "key packages"])
    })
})

describe("the 24 words typed on a device", () => {
    it("refuses wrong words even when the archive is empty, and keeps nothing", async () => {
        const { idp } = await account()
        expect(idp.archive.size).toBe(0)
        const phone = historyDevice(idp, "phone")
        idp.log.length = 0

        expect(await typeWords(phone, generateMnemonic(wordlist, 256).split(" "))).toEqual({ kind: "wrong-passphrase" })
        expect(phone.storage.kept).toBeNull()
        expect(idp.log).toEqual(["register device", "name session", "read key"])
    })

    it("keeps the right words, approves the device with them and reports, then restores", async () => {
        const { idp, laptop, words } = await account()
        await archive(laptop, [1, 2])
        laptop.e2ee.bufferEditForArchive(
            C1,
            new Uint8Array([7, 7, 7]),
            archivedEdit(SENDER, "2026-11-01T10:00:09Z", { target_message_id: id(1), new_text: "m1, edited" }),
        )
        await laptop.e2ee["flushArchiveNow"]()
        const phone = historyDevice(idp, "phone")
        idp.log.length = 0

        const restored = await typeWords(phone, words)

        expect(idp.log).toEqual([
            "register device",
            "name session",
            "read key",
            "save words 1",
            "approve by passphrase 1",
            "report 1",
            "save words 1 approved",
            "key packages",
            "read archive",
        ])
        expect(restored).toMatchObject({ kind: "restored", decrypted: 3, skipped: 0 })
        expect(restored.kind === "restored" && restored.messages.map((m) => m.text)).toEqual(["m1, edited", "m2"])
        expect(idp.reports.get(phone.storage.deviceId)).toBe(1)
    })

    it("runs Argon2id once, a double submit included", async () => {
        const { idp, words } = await account()
        const phone = historyDevice(idp, "phone")

        const outcomes = await Promise.all([typeWords(phone, words), typeWords(phone, words)])

        expect(outcomes.map((o) => o.kind)).toEqual(["restored", "restored"])
        expect(phone.sealer.derivations).toBe(1)
    })

    it("refuses the right words under an approval key the instance swapped, and keeps nothing", async () => {
        const { idp, words } = await account()
        idp.key = { ...idp.key!, approvalPublicKey: otherApprovalKey() }
        const phone = historyDevice(idp, "phone")

        expect(await typeWords(phone, words)).toEqual({ kind: "key-swapped" })
        expect(phone.storage.kept).toBeNull()
    })

    it("refuses a key older than one this device has seen", async () => {
        const { idp, words } = await account()
        const phone = historyDevice(idp, "phone")
        phone.storage.newest = 2

        expect(await typeWords(phone, words)).toEqual({ kind: "rolled-back" })
        expect(phone.storage.kept).toBeNull()
    })

    it("tells a generation set while it approved itself: the key changed, the words stay, nothing restored", async () => {
        const { idp, words } = await account()
        const phone = historyDevice(idp, "phone")
        const next = await historyDevice(idp, "elsewhere").e2ee.mintHistoryKey(2)
        idp.onApprove = () => {
            idp.onApprove = null
            idp.key = { ...next.key, setByDevice: "elsewhere" }
        }

        expect(await typeWords(phone, words)).toEqual({ kind: "key-changed" })
        expect(await phone.e2ee.historyKeyStanding()).toMatchObject({ kind: "mismatch", generation: 2, held: 1 })
        expect(phone.storage.kept?.words).toEqual(words)
        expect(idp.log).not.toContain("read archive")
    })
})

describe("holding a generation, checked against the IdP's key", () => {
    it("at startup, approves and reports a device that holds the key but hadn't yet — then only checks", async () => {
        const { idp, laptop } = await account()
        laptop.storage.kept = { ...laptop.storage.kept!, approvedRootKey: null }
        idp.approvals.length = 0
        const reloaded = historyDevice(idp, "laptop", laptop.storage)

        expect(await startUp(reloaded)).toEqual({ kind: "holds", generation: 1, settled: true })
        expect(await startUp(reloaded)).toEqual({ kind: "holds", generation: 1, settled: true })
        expect(idp.approvals).toEqual([{ deviceId: laptop.storage.deviceId, generation: 1 }])
    })

    it("a settled device whose root key changed approves itself again", async () => {
        const { idp, laptop } = await account()
        laptop.storage.rootKey = ed25519.keygen()
        const reloaded = historyDevice(idp, "laptop", laptop.storage)

        expect(await startUp(reloaded)).toEqual({ kind: "holds", generation: 1, settled: true })
        expect(idp.approvals).toHaveLength(2)
        expect(Array.from(laptop.storage.kept!.approvedRootKey!)).toEqual(Array.from(laptop.storage.rootKey.publicKey))
    })

    it("stops uploading, drops what waited and keeps its words once a later generation is set elsewhere", async () => {
        const { idp, laptop, words } = await account()
        laptop.e2ee.bufferForArchive(C1, id(1), archivedText(SENDER, "2026-11-01T10:00:00Z", { text: "m1" }, undefined))
        const { other } = await startOverElsewhere(idp)

        const standing = await startUp(laptop)

        expect(standing).toEqual({
            kind: "mismatch",
            generation: 2,
            setByDevice: other.storage.deviceId,
            reason: "check-value",
            held: 1,
        })
        expect(laptop.storage.standing).toEqual(standing)
        expect(laptop.storage.kept).toMatchObject({ words, generation: 1 })
        expect(buffered(laptop)).toEqual([])
        await archive(laptop, [2])
        expect(idp.uploads).toEqual([])
    })

    it("stops uploading and keeps its words under an approval key the instance swapped", async () => {
        const { idp, laptop, words } = await account()
        idp.key = { ...idp.key!, approvalPublicKey: otherApprovalKey() }

        expect(await startUp(laptop)).toMatchObject({ kind: "mismatch", generation: 1, reason: "approval-key" })
        expect(laptop.storage.kept?.words).toEqual(words)
        await archive(laptop, [1])
        expect(idp.uploads).toEqual([])
    })

    it("refuses a key older than the newest seen, even one its words give", async () => {
        const { laptop } = await account()
        laptop.storage.newest = 2

        expect(await startUp(laptop)).toMatchObject({ kind: "mismatch", generation: 1, reason: "rollback", held: 1 })
    })

    it("refuses its own generation's key relabelled under another number", async () => {
        const { idp, laptop } = await account()
        idp.key = { ...idp.key!, generation: 2 }

        expect(await startUp(laptop)).toMatchObject({ kind: "mismatch", generation: 2, reason: "relabelled", held: 1 })
    })

    it("a page load names the session's device, then settles a pending key and checks", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")
        vi.spyOn(idp, "setKey").mockRejectedValueOnce(new Error("closed"))
        await expect(found(laptop)).rejects.toThrow("closed")
        const reloaded = historyDevice(idp, "laptop", laptop.storage)
        vi.spyOn(reloaded.e2ee, "hasLocalIdentity").mockResolvedValue(true)
        idp.log.length = 0

        const started = await startThisDeviceUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)

        expect(started).toEqual({ linked: true })
        expect(idp.log).toEqual([
            "register device",
            "name session",
            "read key",
            "set key 1",
            "save words 1",
            "erase pending",
            "read key",
            "approve by passphrase 1",
            "report 1",
            "save words 1 approved",
        ])
    })

    it("leaves the first check to a flow: the flusher waits for it", async () => {
        const { idp, laptop } = await account()
        const reloaded = historyDevice(idp, "laptop", laptop.storage)
        idp.log.length = 0

        await archive(reloaded, [1])
        expect(idp.log).toEqual([])
        expect(buffered(reloaded)).toEqual([id(1)])

        await startUp(reloaded)
        await reloaded.e2ee["flushArchiveNow"]()
        expect(idp.uploads).toEqual([{ generation: 1, ids: [id(1)] }])
    })

    it("checks after a reload without Argon2id", async () => {
        const { idp, laptop } = await account()
        const reloaded = historyDevice(idp, "laptop", laptop.storage)

        expect((await startUp(reloaded)).kind).toBe("holds")
        expect(reloaded.sealer.derivations).toBe(0)
    })
})

describe("uploads under a generation", () => {
    it("seal each entry under the generation held, its conversation and id as associated data", async () => {
        const { idp, laptop } = await account()

        await archive(laptop, [1, 2])

        expect(idp.uploads).toEqual([{ generation: 1, ids: [id(1), id(2)] }])
        const entry = idp.archive.get(id(1))!
        const hak = laptop.storage.kept!.derived.hak
        const sealer = new FastSealer()
        await expect(sealer.decrypt(hak, entry.ciphertext, entry.nonce, archiveEntryAad(C1, id(1)))).resolves.toBeDefined()
        await expect(sealer.decrypt(hak, entry.ciphertext, entry.nonce, archiveEntryAad(C2, id(1)))).rejects.toThrow()
    })

    it("archive an edit once, under the id its ciphertext gives, whichever path met it", async () => {
        const { idp, laptop } = await account()
        const ciphertext = new Uint8Array([4, 5, 6])
        const edit = archivedEdit(SENDER, "2026-11-01T10:00:09Z", { target_message_id: id(1), new_text: "edited" })

        laptop.e2ee.bufferEditForArchive(C1, ciphertext, edit)
        laptop.e2ee.bufferEditForArchive(C1, ciphertext.slice(), edit)
        await archive(laptop, [])

        expect(idp.uploads).toEqual([{ generation: 1, ids: [editEntryId(sha256(ciphertext))] }])
    })

    it("on stale_history_key, read the key again and send the batch again under the generation now held", async () => {
        const { idp, laptop } = await account()
        // Another tab of this device takes the next generation's words; this one still holds the first.
        const { words: next } = await startOverElsewhere(idp)
        const otherTab = historyDevice(idp, "laptop", laptop.storage)
        expect((await typeWords(otherTab, next)).kind).toBe("restored")

        await archive(laptop, [1, 2])

        expect(idp.uploads).toEqual([
            { generation: 1, ids: [id(1), id(2)] },
            { generation: 2, ids: [id(1), id(2)] },
        ])
        const restored = await otherTab.e2ee.restoreHistory(IDP, otherTab.token)
        expect(restored.skipped).toBe(0)
        expect(restored.entries.map((e) => e.id)).toEqual([id(1), id(2)])
    })

    it("on stale_history_key without the new words, send nothing more and drop what waited", async () => {
        const { idp, laptop } = await account()
        const { words: next } = await startOverElsewhere(idp)

        await archive(laptop, [1, 2])

        expect(idp.uploads).toEqual([{ generation: 1, ids: [id(1), id(2)] }])
        expect(await laptop.e2ee.historyKeyStanding()).toMatchObject({ kind: "mismatch", generation: 2, held: 1 })
        expect(buffered(laptop)).toEqual([])
        expect(laptop.storage.kept?.generation).toBe(1)

        expect((await typeWords(laptop, next)).kind).toBe("restored")
        await archive(laptop, [3])
        expect(idp.uploads.at(-1)).toEqual({ generation: 2, ids: [id(3)] })
    })

    it(`wait at most ${ARCHIVE_BUFFER_LIMIT}, the oldest dropped`, async () => {
        const { laptop } = await account()

        for (let n = 0; n < ARCHIVE_BUFFER_LIMIT + 5; n++) {
            laptop.e2ee.bufferForArchive(C1, id(n), archivedText(SENDER, "2026-11-01T10:00:00Z", { text: `${n}` }, undefined))
        }

        expect(buffered(laptop)).toHaveLength(ARCHIVE_BUFFER_LIMIT)
        expect(buffered(laptop)[0]).toBe(id(5))
    })

    it("go on under the same generation once the backup is cleared, the words kept", async () => {
        const { idp, laptop, words } = await account()
        await archive(laptop, [1])

        await clearHistoryBackupUseCase(laptop.deps)(IDP, laptop.token)
        await archive(laptop, [2])

        expect(idp.uploads.at(-1)).toEqual({ generation: 1, ids: [id(2)] })
        expect([...idp.archive.keys()]).toEqual([id(2)])
        expect(await laptop.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 1, settled: true })
        expect(laptop.storage.kept).toMatchObject({ words, generation: 1 })
    })
})

describe("restoring the archive", () => {
    it("opens each entry only under the ids its row carries: one moved to another id or conversation is skipped", async () => {
        const { idp, laptop } = await account()
        await archive(laptop, [1, 2, 3])
        const moved = idp.archive.get(id(1))!
        idp.archive.delete(id(1))
        idp.archive.set(id(9), { ...moved, id: id(9) })
        idp.archive.set(id(2), { ...idp.archive.get(id(2))!, conversation_id: C2 })

        const { entries, skipped } = await laptop.e2ee.restoreHistory(IDP, laptop.token)

        expect(skipped).toBe(2)
        expect(entries.map((e) => [e.conversationId, e.id])).toEqual([[C1, id(3)]])
    })
})
