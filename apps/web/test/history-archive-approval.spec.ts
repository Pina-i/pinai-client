/**
 * Saving to the archive takes a device approved under the generation it saves under
 * (`identity-provider/specs/e2ee.md § 3.8`): the IdP refuses any other's upload with
 * `403 approval_required`, as the first entry stored under an id is the one a device added later
 * restores. On each path that saves — the archive's queue, the first device, typed words, a start
 * over, a replacement and its re-archive, a device its partner approved taking its share — nothing
 * goes before the device's own approval by its words landed; what was queued waits, then goes. A
 * refusal keeps the entries and holds the saves until a check of the key or an approval lands,
 * never on a timer; the re-archive pauses at its cursor and goes on from it. Real E2EE engines over
 * an IdP keeping the rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import type { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import type { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { ARCHIVE_BUFFER_LIMIT, archivedText } from "@pinai/domain/models/history-archive"
import { opensSaves, savesToArchive, type HistoryKeyStanding } from "@pinai/domain/models/history-key"
import type { CachedMessage } from "@pinai/domain/models/history-rearchive"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"
import { acceptHistoryShareUseCase } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { approveHeldWordsUseCase, tryApproveHeldWords } from "@pinai/domain/usecases/e2ee/approve-by-passphrase.usecase"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { checkHistoryKeyUseCase } from "@pinai/domain/usecases/e2ee/check-history-key.usecase"
import { HistoryRearchive } from "@pinai/domain/usecases/e2ee/rearchive-history.usecase"
import { replaceWordsUseCase } from "@pinai/domain/usecases/e2ee/replace-words.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { startOverUseCase } from "@pinai/domain/usecases/e2ee/start-over.usecase"

import { accessToken } from "./setup/access-token"
import { ACTOR, FakeHistoryIdp, IDP, historyDevice, nameSession } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"
import { bundleHpke, sharingAccount } from "./setup/key-shares"

const SENDER = { address: "bob_a1b2c@idp.test", displayName: "Bob" }
const C1 = "11112222-3333-4444-5555-666677778888"
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

type Device = ReturnType<typeof historyDevice>
type Saving = { e2ee: E2eeAdapter; token: string }

const flushing: Saving[] = []

beforeEach(() => {
    // The flusher's 2-second timer never fires by itself: every flush here is one the test asks for.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
})

afterEach(() => {
    for (const device of flushing.splice(0)) device.e2ee.stopFlushing()
    vi.useRealTimers()
    vi.restoreAllMocks()
})

/** Messages this device read, queued for the archive, its flusher started. */
function queue(device: Saving, ids: number[]): void {
    if (!flushing.includes(device)) {
        flushing.push(device)
        device.e2ee.startFlushing(IDP, () => device.token)
    }
    for (const n of ids) device.e2ee.bufferForArchive(C1, id(n), archivedText(SENDER, "2026-11-01T10:00:00Z", { text: `m${n}` }, undefined))
}

const flush = (device: Saving) => device.e2ee["flushArchiveNow"]()
const waiting = (device: Saving) => device.e2ee["archiveBuffer"].map((e) => e.entryId)
const saved = (idp: FakeHistoryIdp) => [...idp.archive.keys()].sort()

/** `save` runs as the device's own approval by its words is about to go: the words kept, the approval not landed. */
function beforeOwnApproval(device: { deps: { deviceDirectoryPort: IDeviceDirectoryPort } }, save: () => Promise<void>): void {
    const directory = device.deps.deviceDirectoryPort
    const approve = directory.approveByPassphrase.bind(directory)
    vi.spyOn(directory, "approveByPassphrase").mockImplementationOnce(async (...args) => {
        await save()
        return approve(...args)
    })
}

/** Queued and flushed in that window; answers what still waited. */
function savingBeforeApproval(device: Saving & { deps: { deviceDirectoryPort: IDeviceDirectoryPort } }, ids: number[]) {
    const seen = { waiting: [] as string[] }
    beforeOwnApproval(device, async () => {
        queue(device, ids)
        await flush(device)
        seen.waiting = waiting(device)
    })
    return seen
}

const found = (device: Device) => bootstrapFirstDeviceUseCase(device.deps)({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR })

/** An account whose laptop set generation 1, approved and reported. */
async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop")
    const outcome = await found(laptop)
    if (outcome.kind !== "holds") throw new Error("the first device didn't set the key")
    return { idp, laptop, words: outcome.words }
}

async function replace(device: Device): Promise<void> {
    const outcome = await replaceWordsUseCase({ ...device.deps, cacheRead: () => true, applyRestored: async () => undefined })({
        idpUrl: IDP,
        accessToken: device.token,
        actorUri: ACTOR,
        tokenArrivedAt: Date.now(),
    })
    if (outcome.kind !== "replaced") throw new Error(`not replaced: ${outcome.kind}`)
}

const startOver = (device: Device) =>
    startOverUseCase(device.deps)({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR, tokenArrivedAt: Date.now() })

const message = (n: number): CachedMessage => ({
    id: id(n),
    author: "Bob",
    authorAddress: SENDER.address,
    content: `text ${n}`,
    createdAt: new Date(Date.UTC(2026, 9, 1, 10, 0, 0) + n * 1000).toISOString(),
})
const many = (count: number, from = 100) => Array.from({ length: count }, (_, i) => message(from + i))

function rearchiving(device: Device, conversations: Record<string, CachedMessage[]>) {
    return new HistoryRearchive({
        e2ee: device.e2ee,
        localHistory: async () => ({ me: "alice_xk9mp@idp.test", conversations }),
        sleep: async () => undefined,
    })
}

const context = (device: Device) => ({ idpUrl: IDP, accessToken: () => device.token })
const offline = () => new TypeError("Failed to fetch")
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)
const holds = (generation: number, settled: boolean): HistoryKeyStanding => ({ kind: "holds", generation, settled })

/** The re-archive's first batch taken, then the instance stops counting the device approved: its approvals answered. */
function refusedAfterFirstBatch(idp: FakeHistoryIdp, second: (upload: () => Promise<number>) => Promise<number>) {
    const upload = idp.uploadBatch.bind(idp)
    const dropped: typeof idp.approvals = []
    vi.spyOn(idp, "uploadBatch")
        .mockImplementationOnce(async (...args) => {
            const inserted = await upload(...args)
            dropped.push(...idp.approvals.splice(0))
            return inserted
        })
        .mockImplementationOnce((...args) => second(() => upload(...args)))
    return dropped
}

describe("the rules", () => {
    it("saves only holding the key in force, approved under it by the device's own words", () => {
        expect(savesToArchive(holds(2, true))).toBe(true)
        expect(savesToArchive(holds(2, false))).toBe(false)
        expect(savesToArchive({ kind: "unchecked" })).toBe(false)
        expect(savesToArchive({ kind: "no-passphrase", generation: 2 })).toBe(false)
        expect(savesToArchive({ kind: "mismatch", generation: 3, setByDevice: null, reason: "check-value", held: 2 })).toBe(false)
    })

    it("opens saves held back as the device comes to stand approved under a generation, not at every check that finds it so", () => {
        expect(opensSaves({ kind: "unchecked" }, holds(1, true))).toBe(true)
        expect(opensSaves(holds(1, false), holds(1, true))).toBe(true)
        expect(opensSaves(holds(1, true), holds(2, true))).toBe(true)
        expect(opensSaves(holds(1, true), holds(1, true))).toBe(false)
        expect(opensSaves(holds(1, true), holds(2, false))).toBe(false)
        expect(opensSaves(holds(1, false), { kind: "no-key" })).toBe(false)
    })
})

describe("the IdP's rule", () => {
    it("refuses an upload from a session naming no device, or naming one not approved under the key — a stale generation first", async () => {
        const { idp, laptop } = await account()
        const phone = historyDevice(idp, "phone")
        await nameSession(phone)
        const entry = { id: id(1), conversation_id: C1, ciphertext: new Uint8Array(8), nonce: new Uint8Array(12) }

        await expect(idp.uploadBatch(IDP, accessToken(Date.now(), "laptop"), 1, [entry])).rejects.toMatchObject({ status: 403, code: "approval_required" })
        await expect(idp.uploadBatch(IDP, phone.token, 1, [entry])).rejects.toMatchObject({ status: 403, code: "approval_required" })
        await expect(idp.uploadBatch(IDP, phone.token, 2, [entry])).rejects.toMatchObject({ status: 409, code: "stale_history_key" })
        await expect(idp.uploadBatch(IDP, laptop.token, 1, [entry])).resolves.toBe(1)
    })
})

describe("the archive's queue (§ 3.8)", () => {
    it("keeps a batch refused for approval, tries nothing more on its timer, and saves it at the next check of the key", async () => {
        const { idp, laptop } = await account()
        const approvals = idp.approvals.splice(0)

        queue(laptop, [1, 2])
        await flush(laptop)
        expect(idp.refusedUploads).toEqual([{ generation: 1, ids: [id(1), id(2)] }])
        expect(waiting(laptop)).toEqual([id(1), id(2)])

        queue(laptop, [3])
        await vi.advanceTimersByTimeAsync(60_000)
        expect(idp.uploads).toHaveLength(1)
        expect(waiting(laptop)).toEqual([id(1), id(2), id(3)])

        idp.approvals.push(...approvals)
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        await flush(laptop)
        expect(saved(idp)).toEqual([id(1), id(2), id(3)])
        expect(waiting(laptop)).toEqual([])
    })

    it("saves once an approval lands (`device_approved`) after a refusal; one landing before any refusal changes nothing", async () => {
        const { idp, laptop } = await account()
        const resumed = vi.fn()
        laptop.e2ee.onSavesResumable(resumed)
        laptop.e2ee.approvalLanded()
        expect(resumed).not.toHaveBeenCalled()

        const approvals = idp.approvals.splice(0)
        queue(laptop, [1])
        await flush(laptop)
        await flush(laptop)
        expect(idp.uploads).toHaveLength(1)

        idp.approvals.push(...approvals)
        laptop.e2ee.approvalLanded()
        expect(resumed).toHaveBeenCalledTimes(1)
        await flush(laptop)
        expect(saved(idp)).toEqual([id(1)])
    })

    it("from a session that named no device yet: refused, kept, and saved once the next route names it and checks", async () => {
        const { idp, laptop } = await account()
        const reloaded = historyDevice(idp, "laptop", laptop.storage)
        // The gate checks before the naming, which an instance out of reach put off.
        await reloaded.e2ee.checkHistoryKey(IDP, reloaded.token)

        queue(reloaded, [1])
        await flush(reloaded)
        expect(idp.refusedUploads).toEqual([{ generation: 1, ids: [id(1)] }])
        expect(waiting(reloaded)).toEqual([id(1)])

        await nameSession(reloaded)
        await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)
        await flush(reloaded)
        expect(saved(idp)).toEqual([id(1)])
    })

    it("tells its listeners when the device comes to stand approved, not at every check that finds it so", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")
        const resumed = vi.fn()
        laptop.e2ee.onSavesResumable(resumed)

        await found(laptop)
        expect(resumed).toHaveBeenCalledTimes(1)
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
        expect(resumed).toHaveBeenCalledTimes(1)
    })
})

describe("each path that saves: nothing before the device's own approval, then what waited", () => {
    it("the first device (§ 6.1), between generation 1 kept and its approval", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop")
        const window = savingBeforeApproval(laptop, [1, 2])

        expect((await found(laptop)).kind).toBe("holds")
        expect(window.waiting).toEqual([id(1), id(2)])
        expect(idp.uploads).toEqual([])

        await flush(laptop)
        expect(idp.uploads).toEqual([{ generation: 1, ids: [id(1), id(2)] }])
        expect(idp.refusedUploads).toEqual([])
    })

    it("typed words (§ 6.4), between the words kept and their approval", async () => {
        const { idp, words } = await account()
        const phone = historyDevice(idp, "phone")
        const window = savingBeforeApproval(phone, [1])

        const typed = await restoreHistoryFromPassphraseUseCase(phone.deps)({ idpUrl: IDP, accessToken: phone.token, actorUri: ACTOR, passphrase: words })
        expect(typed.kind).toBe("kept")
        expect(window.waiting).toEqual([id(1)])
        expect(idp.uploads).toEqual([])

        await flush(phone)
        expect(idp.uploads).toEqual([{ generation: 1, ids: [id(1)] }])
        expect(idp.refusedUploads).toEqual([])
    })

    it("a start over (§ 6.11): nothing under generation n+1 before the device approved itself by it", async () => {
        const { idp } = await account()
        const phone = historyDevice(idp, "phone")
        const window = savingBeforeApproval(phone, [1])

        expect((await startOver(phone)).kind).toBe("started-over")
        expect(window.waiting).toEqual([id(1)])
        expect(idp.uploads).toEqual([])

        await flush(phone)
        expect(idp.uploads).toEqual([{ generation: 2, ids: [id(1)] }])
    })

    it("a start over whose approval didn't go, then a reload: the next page load's check approves it; what waited in the page before is gone with it", async () => {
        const { idp } = await account()
        const phone = historyDevice(idp, "phone")
        vi.spyOn(phone.deps.deviceDirectoryPort, "approveByPassphrase").mockRejectedValueOnce(offline())

        expect((await startOver(phone)).kind).toBe("started-over")
        queue(phone, [1])
        await flush(phone)
        expect(idp.uploads).toEqual([])
        expect(waiting(phone)).toEqual([id(1)])

        const reloaded = historyDevice(idp, "phone", phone.storage)
        await nameSession(reloaded)
        expect(await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)).toEqual({ kind: "holds", generation: 2, settled: true })
        queue(reloaded, [2])
        await flush(reloaded)
        expect(idp.uploads).toEqual([{ generation: 2, ids: [id(2)] }])
    })

    it("a replacement (§ 6.12): the queue saves nothing under the new words before they approved the device", async () => {
        const { idp, laptop } = await account()
        const window = savingBeforeApproval(laptop, [1])

        await replace(laptop)
        expect(window.waiting).toEqual([id(1)])
        expect(idp.uploads).toEqual([])

        await flush(laptop)
        expect(idp.uploads).toEqual([{ generation: 2, ids: [id(1)] }])
        expect(idp.refusedUploads).toEqual([])
    })

    it("a device its partner approved with the code (§ 6.10), taking its share: nothing before its own approval by the words", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined)
        const hpke: MlsAdapter = await bundleHpke()
        const a = await sharingAccount(hpke, new FakeIssuers())
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        const window = savingBeforeApproval(a.phone, [1])

        expect(await acceptHistoryShareUseCase(a.phone.deps)(IDP, a.phone.token, ACTOR)).toEqual({ kind: "kept", generation: 1 })
        expect(window.waiting).toEqual([id(1)])
        expect(a.idp.uploads).toEqual([])

        await flush(a.phone)
        expect(a.idp.uploads).toEqual([{ generation: 1, ids: [id(1)] }])
        expect(a.idp.refusedUploads).toEqual([])
    })
})

describe("the re-archive after a replacement (§ 6.12)", () => {
    it("waits at its cursor while the replacement's approval didn't go, then runs once the device is approved", async () => {
        const { idp, laptop } = await account()
        vi.spyOn(laptop.deps.deviceDirectoryPort, "approveByPassphrase").mockRejectedValueOnce(offline())
        await replace(laptop)
        const upload = vi.spyOn(idp, "uploadBatch")
        const running = rearchiving(laptop, { [C1]: many(3) })
        const resumed = vi.fn(() => void running.run(context(laptop)))
        laptop.e2ee.onSavesResumable(resumed)

        expect(await running.run(context(laptop))).toEqual({ kind: "idle" })
        expect(upload).not.toHaveBeenCalled()
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })

        await checkHistoryKeyUseCase(laptop.deps)(IDP, laptop.token, ACTOR)
        expect(resumed).toHaveBeenCalledTimes(1)
        expect(await running.run(context(laptop))).toEqual({ kind: "rearchived", generation: 2, messages: 3, skipped: 0 })
        expect(idp.archive.size).toBe(3)
        expect(idp.refusedUploads).toEqual([])
        expect(laptop.storage.rearchiveDue).toBeNull()
    })

    it("refused mid-way, pauses at its cursor — nothing skipped, nothing marked done — and goes on from it once an approval lands", async () => {
        const { idp, laptop } = await account()
        await replace(laptop)
        let approvals: typeof idp.approvals = []
        vi.spyOn(idp, "uploadBatch").mockImplementationOnce(async (...args) => {
            const inserted = await FakeHistoryIdp.prototype.uploadBatch.apply(idp, args)
            approvals = idp.approvals.splice(0)
            return inserted
        })
        const running = rearchiving(laptop, { [C1]: many(60) })

        expect(await running.run(context(laptop))).toEqual({ kind: "paused", generation: 2 })
        expect(idp.refusedUploads).toHaveLength(1)
        expect(idp.archive.size).toBe(50)
        expect(laptop.storage.rearchiveDue?.cursor?.messageId).toBe(id(149))

        idp.approvals.push(...approvals)
        const resumed = vi.fn(() => void running.run(context(laptop)))
        laptop.e2ee.onSavesResumable(resumed)
        laptop.e2ee.approvalLanded()
        expect(resumed).toHaveBeenCalledTimes(1)

        expect(await running.run(context(laptop))).toEqual({ kind: "rearchived", generation: 2, messages: 60, skipped: 0 })
        expect(idp.archive.size).toBe(60)
        expect(laptop.storage.rearchiveDue).toBeNull()
        const taken = idp.uploads.filter((u) => !idp.refusedUploads.includes(u)).flatMap((u) => u.ids)
        expect(new Set(taken).size).toBe(60)
    })
})

describe("a device whose own approval didn't go: approved again within the page load", () => {
    it("at the gate's next check — the KeyPackage tick reads the same —, and what waited then goes", async () => {
        const { idp } = await account()
        const phone = historyDevice(idp, "phone")
        vi.spyOn(phone.deps.deviceDirectoryPort, "approveByPassphrase").mockRejectedValueOnce(offline())
        expect((await startOver(phone)).kind).toBe("started-over")
        queue(phone, [1])
        await flush(phone)
        expect(idp.uploads).toEqual([])

        const { standing, admission } = await checkAdmissionUseCase(phone.deps)(IDP, phone.token, ACTOR)
        expect(standing).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(admission).toMatchObject({ kind: "in" })
        await flush(phone)
        expect(idp.uploads).toEqual([{ generation: 2, ids: [id(1)] }])
    })

    it("when the socket comes back: a replacement's report cut short is made, and its re-archive goes on", async () => {
        const { idp, laptop } = await account()
        vi.spyOn(laptop.deps.deviceDirectoryPort, "reportHistoryKey").mockRejectedValueOnce(offline())
        await replace(laptop)
        const running = rearchiving(laptop, { [C1]: many(3) })
        laptop.e2ee.onSavesResumable(() => void running.run(context(laptop)))
        expect(await running.run(context(laptop))).toEqual({ kind: "idle" })

        expect(await approveHeldWordsUseCase(laptop.deps)(IDP, laptop.token, ACTOR)).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(await running.run(context(laptop))).toEqual({ kind: "rearchived", generation: 2, messages: 3, skipped: 0 })
        expect(idp.archive.size).toBe(3)
    })

    it("leaves an unnamed session or an instance out of reach for the next try, saying nothing; reports anything else; never throws", async () => {
        const { idp } = await account()
        const phone = historyDevice(idp, "phone")
        const approve = vi.spyOn(phone.deps.deviceDirectoryPort, "approveByPassphrase").mockRejectedValueOnce(offline())
        await startOver(phone)
        const standing = await phone.e2ee.historyKeyStanding()
        const report = vi.fn()
        approve
            .mockRejectedValueOnce(new IdpError(403, "device_required", "Name this session's device first"))
            .mockRejectedValueOnce(offline())
            .mockRejectedValueOnce(new IdpError(400, "invalid_request", "signature does not verify"))

        for (let i = 0; i < 3; i++) expect(await tryApproveHeldWords({ ...phone.deps, report }, IDP, phone.token, ACTOR, standing)).toEqual(standing)
        expect(report).toHaveBeenCalledTimes(1)
        expect(report).toHaveBeenCalledWith("approving this device by its words", expect.objectContaining({ code: "invalid_request" }))
    })
})

describe("a refusal answered after the signal that would lift it", () => {
    it("the queue: an approval landing while the batch was being refused holds nothing — the next flush saves it", async () => {
        const { idp, laptop } = await account()
        const approvals = idp.approvals.splice(0)
        const upload = idp.uploadBatch.bind(idp)
        vi.spyOn(idp, "uploadBatch").mockImplementationOnce(async (...args) => {
            try {
                return await upload(...args)
            } finally {
                idp.approvals.push(...approvals)
                laptop.e2ee.approvalLanded()
            }
        })

        queue(laptop, [1])
        await flush(laptop)
        expect(idp.refusedUploads).toHaveLength(1)
        expect(waiting(laptop)).toEqual([id(1)])
        await flush(laptop)
        expect(saved(idp)).toEqual([id(1)])
    })

    it("the re-archive: a check of the key landing while a batch was being refused lets the run go on, no other signal needed", async () => {
        const { idp, laptop } = await account()
        await replace(laptop)
        const running = rearchiving(laptop, { [C1]: many(60) })
        laptop.e2ee.onSavesResumable(() => void running.run(context(laptop)))
        const approvals = refusedAfterFirstBatch(idp, async (upload) => {
            try {
                return await upload()
            } finally {
                idp.approvals.push(...approvals)
                await laptop.e2ee.checkHistoryKey(IDP, laptop.token)
            }
        })

        expect(await running.run(context(laptop))).toEqual({ kind: "rearchived", generation: 2, messages: 60, skipped: 0 })
        expect(idp.refusedUploads).toHaveLength(1)
        expect(idp.archive.size).toBe(60)
    })
})

describe("the re-archive's run", () => {
    it("a call made while a run is being paused isn't lost: the run looks once more as it ends", async () => {
        const { idp, laptop } = await account()
        await replace(laptop)
        const running = rearchiving(laptop, { [C1]: many(60) })
        const approvals = refusedAfterFirstBatch(idp, async (upload) => {
            try {
                return await upload()
            } finally {
                idp.approvals.push(...approvals)
                void running.run(context(laptop))
            }
        })

        expect(await running.run(context(laptop))).toEqual({ kind: "rearchived", generation: 2, messages: 60, skipped: 0 })
        expect(idp.archive.size).toBe(60)
    })

    it("nor one made while it reads the device not approved yet", async () => {
        const { idp, laptop } = await account()
        vi.spyOn(laptop.deps.deviceDirectoryPort, "approveByPassphrase").mockRejectedValueOnce(offline())
        await replace(laptop)
        const running = rearchiving(laptop, { [C1]: many(3) })
        const standing = laptop.e2ee.historyKeyStanding.bind(laptop.e2ee)
        vi.spyOn(laptop.e2ee, "historyKeyStanding").mockImplementationOnce(async () => {
            const read = await standing()
            await approveHeldWordsUseCase(laptop.deps)(IDP, laptop.token, ACTOR)
            void running.run(context(laptop))
            return read
        })

        expect(await running.run(context(laptop))).toEqual({ kind: "rearchived", generation: 2, messages: 3, skipped: 0 })
        expect(idp.archive.size).toBe(3)
    })

    it("a stale refusal whose key read finds the device holding the generation, not approved over its root key, ends paused — not failed", async () => {
        const { idp, laptop } = await account()
        await replace(laptop)
        vi.spyOn(idp, "uploadBatch").mockRejectedValueOnce(new IdpError(409, "stale_history_key", "Not the account's current history key"))
        laptop.storage.rootKey = ed25519.keygen()
        idp.rootKeys.set(laptop.storage.deviceId, laptop.storage.rootKey.publicKey)
        const running = rearchiving(laptop, { [C1]: many(3) })

        expect(await running.run(context(laptop))).toEqual({ kind: "paused", generation: 2 })
        expect(laptop.storage.rearchiveDue).toEqual({ generation: 2, cursor: null })

        await checkHistoryKeyUseCase(laptop.deps)(IDP, laptop.token, ACTOR)
        expect(await running.run(context(laptop))).toEqual({ kind: "rearchived", generation: 2, messages: 3, skipped: 0 })
    })

    it("refused for approval, holds the queue too, until the approval lands", async () => {
        const { idp, laptop } = await account()
        await replace(laptop)
        const approvals = idp.approvals.splice(0)

        expect(await rearchiving(laptop, { [C1]: many(3) }).run(context(laptop))).toEqual({ kind: "paused", generation: 2 })
        queue(laptop, [1])
        await flush(laptop)
        expect(idp.uploads).toHaveLength(1)

        idp.approvals.push(...approvals)
        laptop.e2ee.approvalLanded()
        await flush(laptop)
        expect(saved(idp)).toEqual([id(1)])
    })
})

describe(`the queue at its cap (${ARCHIVE_BUFFER_LIMIT})`, () => {
    it("a batch put back drops the oldest, warns once, and leaves their ids free to be queued again", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
        const { idp, laptop } = await account()
        idp.approvals.splice(0)
        const upload = idp.uploadBatch.bind(idp)
        vi.spyOn(idp, "uploadBatch").mockImplementationOnce(async (...args) => {
            queue(laptop, range(ARCHIVE_BUFFER_LIMIT, ARCHIVE_BUFFER_LIMIT + 50))
            return upload(...args)
        })

        queue(laptop, range(0, ARCHIVE_BUFFER_LIMIT))
        await flush(laptop)
        expect(idp.refusedUploads).toEqual([{ generation: 1, ids: range(0, 50).map(id) }])
        expect(waiting(laptop)).toEqual(range(50, ARCHIVE_BUFFER_LIMIT + 50).map(id))

        queue(laptop, [0])
        expect(waiting(laptop)).toHaveLength(ARCHIVE_BUFFER_LIMIT)
        expect(waiting(laptop).at(-1)).toBe(id(0))
        expect(warn.mock.calls.filter(([line]) => String(line).startsWith("[history-archive]"))).toHaveLength(1)
    })
})
