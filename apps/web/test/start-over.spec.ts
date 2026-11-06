/**
 * Starting over (`identity-provider/specs/e2ee.md § 6.11`; the design's § 5.4): the password typed
 * recently is timed on the IdP's clock before anything is minted; generation n+1 — past every one
 * seen — is minted as pending and set, and once the IdP took it the start over has happened: its
 * words kept and marked to show, the approval, report, KeyPackages and shares best effort after. A
 * `401` or `409` reads the key again, keeping one that landed; otherwise the pending key is erased
 * and nothing shown. A pending generation past 1 is never set again by itself: kept when it is the
 * key in force, erased otherwise — but never within two minutes of its writing, and one tab at a
 * time under the account's lock. A device starting to act — a start over, a replacement, typed words —
 * takes the devices listed then as seen, and after a start over as from before. Real E2EE engines
 * over fakes keeping the IdP's rules.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { RECENT_SIGN_IN_MS, signedInRecently } from "@pinai/domain/models/auth"
import {
    PENDING_KEY_FRESH_MS,
    firstWordsShownOffline,
    settlePending,
    startOverGeneration,
    type HistoryKey,
} from "@pinai/domain/models/history-key"
import { IdpError } from "@pinai/domain/models/idp-error"
import { acceptHistoryShareUseCase } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { checkHistoryKeyUseCase } from "@pinai/domain/usecases/e2ee/check-history-key.usecase"
import { type PendingKeyLock } from "@pinai/domain/usecases/e2ee/settle-pending-history-key.usecase"
import { replaceWordsUseCase } from "@pinai/domain/usecases/e2ee/replace-words.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { startOverUseCase } from "@pinai/domain/usecases/e2ee/start-over.usecase"
import { devicesFromBeforeUseCase } from "@pinai/domain/usecases/e2ee/devices-from-before.usecase"
import { waitingDevices } from "@pinai/domain/models/device-roster"

import { accessToken } from "./setup/access-token"
import { ACTOR, FakeHistoryIdp, IDP, historyDevice, nameSession } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"
import { bundleHpke, sharingAccount, type SharingDevice } from "./setup/key-shares"

const issuers = new FakeIssuers()
let hpke: MlsAdapter

beforeAll(async () => {
    hpke = await bundleHpke()
})

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

type Device = ReturnType<typeof historyDevice>

/** An account whose laptop set generation 1, and a device signed in a moment ago that holds nothing. */
async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop")
    await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    const fresh = historyDevice(idp, "fresh")
    fresh.token = accessToken(Date.now())
    idp.log.length = 0
    return { idp, laptop, fresh }
}

const startOver = (device: Device | SharingDevice, tokenArrivedAt: number | null = Date.now()) =>
    startOverUseCase(device.deps)({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR, tokenArrivedAt })

/** One lock for the account's tabs, as the platform's would be. */
function sharedLock(): PendingKeyLock {
    let last: Promise<unknown> = Promise.resolve()
    return <T>(run: () => Promise<T>) => {
        const mine = last.then(run, run)
        last = mine.catch(() => undefined)
        return mine
    }
}

/** A promise the test settles. */
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => (resolve = res))
    return { promise, resolve }
}

const key = (generation: number, fill = generation): HistoryKey => ({
    generation,
    salt: new Uint8Array(16).fill(fill),
    checkValue: new Uint8Array(32).fill(fill),
    approvalPublicKey: new Uint8Array(32).fill(fill),
})

describe("the rules", () => {
    it("a password is recent for 9 minutes — the IdP's 10, a minute kept in hand —, timed from the token's arrival", () => {
        const typed = Date.now()
        const token = accessToken(typed)

        expect(RECENT_SIGN_IN_MS).toBe(9 * 60_000)
        expect(signedInRecently(token, typed, typed + 8 * 60_000)).toBe(true)
        expect(signedInRecently(token, typed, typed + 9 * 60_000 + 1_000)).toBe(false)
        // Issued 5 minutes after the password, 4 minutes ago: 9 minutes on the IdP's clock.
        const renewed = accessToken(typed, "alice", typed + 5 * 60_000)
        expect(signedInRecently(renewed, typed + 5 * 60_000, typed + 8 * 60_000)).toBe(true)
        expect(signedInRecently(renewed, typed + 5 * 60_000, typed + 9 * 60_000 + 1_000)).toBe(false)
    })

    it("on a device clock 15 minutes fast, a password just typed is still recent", () => {
        const idpNow = Date.now()
        const deviceNow = idpNow + 15 * 60_000
        const token = accessToken(idpNow)

        expect(signedInRecently(token, deviceNow, deviceNow + 60_000)).toBe(true)
        expect(signedInRecently(token, null, deviceNow + 60_000)).toBe(true)
        expect(signedInRecently(token, deviceNow, deviceNow + 9 * 60_000 + 1_000)).toBe(false)
    })

    it("without the token's arrival, either clock saying recent is taken; a token issued long after the password isn't", () => {
        const typed = Date.now() - 30 * 60_000
        expect(signedInRecently(accessToken(typed, "alice", Date.now()))).toBe(false)
        expect(signedInRecently(accessToken(Date.now()))).toBe(true)
    })

    it("a token without `auth_time`, or none, asks the password again", () => {
        const part = (claims: object) => btoa(JSON.stringify(claims))
        expect(signedInRecently(`${part({})}.${part({ exp: 2_000_000_000 })}.sig`)).toBe(false)
        expect(signedInRecently("not a token")).toBe(false)
        expect(signedInRecently(null)).toBe(false)
    })

    it("starts over at the generation after the key in force, only past every one seen", () => {
        expect(startOverGeneration(key(1), 1)).toBe(2)
        expect(startOverGeneration(null, null)).toBe(1)
        expect(startOverGeneration(key(2), 3)).toBeNull()
        expect(startOverGeneration(key(1), 3)).toBeNull()
        expect(startOverGeneration(null, 1)).toBeNull()
    })

    it("keeps a pending key the IdP holds, sends again only a first generation with none in force, and erases the rest", () => {
        expect(settlePending(key(2), key(2))).toBe("keep")
        expect(settlePending(key(2), key(1))).toBe("erase")
        expect(settlePending(key(2), key(2, 9))).toBe("erase")
        expect(settlePending(key(2), null)).toBe("erase")
        expect(settlePending(key(1), null)).toBe("send-again")
        expect(settlePending(key(1), key(1, 9))).toBe("erase")
    })

    it("leaves a pending key written in the last two minutes, whose PUT may yet land", () => {
        const now = Date.now()
        expect(PENDING_KEY_FRESH_MS).toBe(2 * 60_000)
        expect(settlePending({ ...key(2), mintedAt: now - 60_000 }, key(1), now)).toBe("leave")
        expect(settlePending({ ...key(2), mintedAt: now - 2 * 60_000 }, key(1), now)).toBe("erase")
        expect(settlePending({ ...key(2), mintedAt: now - 60_000 }, key(2), now)).toBe("keep")
        expect(settlePending({ ...key(2), mintedAt: null }, key(1), now)).toBe("erase")
        // A clock gone back can't keep a row fresh for good.
        expect(settlePending({ ...key(2), mintedAt: now + 60 * 60_000 }, key(1), now)).toBe("erase")
    })

    it("the setup page shows kept words offline only for the first device's generation, nothing pending", () => {
        expect(firstWordsShownOffline(1, false)).toBe(true)
        expect(firstWordsShownOffline(2, false)).toBe(false)
        expect(firstWordsShownOffline(1, true)).toBe(false)
        expect(firstWordsShownOffline(null, false)).toBe(false)
    })
})

describe("starting over", () => {
    it("with a recent password: mints generation n+1 as pending, and answers its words only once the IdP took it", async () => {
        const { idp, fresh } = await account()
        const answered = deferred<void>()
        const setKey = vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await answered.promise
            return FakeHistoryIdp.prototype.setKey.apply(idp, args)
        })

        let outcome: Awaited<ReturnType<typeof startOver>> | null = null
        const running = startOver(fresh).then((settled) => (outcome = settled))
        await vi.waitFor(() => expect(setKey).toHaveBeenCalledOnce())
        expect(outcome).toBeNull()
        expect(fresh.storage.pending?.key.generation).toBe(2)
        expect(fresh.storage.kept).toBeNull()

        answered.resolve()
        await running

        expect(outcome).toEqual({ kind: "started-over", generation: 2, words: fresh.storage.kept?.words })
        expect(idp.log).toEqual([
            "register device",
            "name session",
            "read key",
            "seal pending 2",
            "set key 2",
            "save words 2",
            "erase pending",
            "approve by passphrase 2",
            "report 2",
            "save words 2 approved",
            "key packages",
        ])
        expect(idp.key).toMatchObject({ generation: 2, setByDevice: fresh.storage.deviceId })
        expect(await fresh.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(fresh.storage.admission).toEqual({ kind: "in", by: "passphrase" })
    })

    it("with a password typed too long ago: mints nothing and sets nothing; signed in again, it starts over", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        const { idp, fresh } = await account()
        const setKey = vi.spyOn(idp, "setKey")
        const arrived = Date.now()
        vi.setSystemTime(arrived + 9 * 60_000 + 1_000)

        expect(await startOver(fresh, arrived)).toEqual({ kind: "recent-sign-in" })
        expect(idp.log).toEqual([])
        expect(fresh.storage.pending).toBeNull()
        expect(fresh.sealer.derivations).toBe(0)
        expect(setKey).not.toHaveBeenCalled()

        fresh.token = accessToken(Date.now())
        expect(await startOver(fresh)).toMatchObject({ kind: "started-over", generation: 2 })
    })

    it("on a device clock 15 minutes fast, a password just typed starts over, asked for nothing", async () => {
        const { idp, fresh } = await account()
        // The IdP's clock is right: it issued the token, and checks it, 15 minutes behind this device.
        fresh.token = accessToken(Date.now() - 15 * 60_000, "fresh", Date.now() - 15 * 60_000)
        idp.recentSignIn = () => true

        expect(await startOver(fresh, Date.now())).toMatchObject({ kind: "started-over", generation: 2 })
    })

    it("a 401 or a 409 whose key landed after all: kept — the start over happened", async () => {
        const { idp, fresh } = await account()
        vi.spyOn(idp, "setKey")
            .mockImplementationOnce(async (...args) => {
                await FakeHistoryIdp.prototype.setKey.apply(idp, args)
                throw new IdpError(401, "insufficient_user_authentication", "Sign in again")
            })

        expect(await startOver(fresh)).toMatchObject({ kind: "started-over", generation: 2 })
        expect(fresh.storage.pending).toBeNull()
        expect(fresh.storage.kept?.generation).toBe(2)
        expect(idp.key?.setByDevice).toBe(fresh.storage.deviceId)
    })

    it("a 401 asking for the password anyway — clocks that disagree — erases the pending key and keeps nothing", async () => {
        const { idp, laptop } = await account()
        const held = laptop.storage.kept
        laptop.token = accessToken(Date.now())
        idp.recentSignIn = () => false

        expect(await startOver(laptop)).toEqual({ kind: "recent-sign-in" })
        expect(laptop.storage.pending).toBeNull()
        expect(laptop.storage.kept).toEqual(held)
        expect(idp.key?.generation).toBe(1)
    })

    it("two devices at once: the loser's pending key is erased, and it keeps and shows nothing", async () => {
        const { idp, fresh } = await account()
        const rival = historyDevice(idp, "rival")
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await nameSession(rival)
            await FakeHistoryIdp.prototype.setKey.call(idp, IDP, rival.token, (await rival.e2ee.mintHistoryKey(2)).key)
            return FakeHistoryIdp.prototype.setKey.apply(idp, args)
        })

        expect(await startOver(fresh)).toEqual({ kind: "conflict" })
        expect(fresh.storage.pending).toBeNull()
        expect(fresh.storage.kept).toBeNull()
        expect(idp.key?.setByDevice).toBe(rival.storage.deviceId)
        expect(idp.approvals.map((a) => a.deviceId)).not.toContain(fresh.storage.deviceId)
    })

    it("a page load's check waits for the PUT under way, so it never erases the words the IdP is taking", async () => {
        const { idp, fresh } = await account()
        const answered = deferred<void>()
        const setKey = vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await answered.promise
            return FakeHistoryIdp.prototype.setKey.apply(idp, args)
        })
        const running = startOver(fresh)
        await vi.waitFor(() => expect(setKey).toHaveBeenCalledOnce())

        const checking = checkHistoryKeyUseCase(fresh.deps)(IDP, fresh.token, ACTOR)
        answered.resolve()

        expect(await running).toMatchObject({ kind: "started-over", generation: 2 })
        expect(await checking).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(fresh.storage.kept?.generation).toBe(2)
    })

    it("refuses to start over at a generation this device has seen: a rollback by one is refused too", async () => {
        const { idp, laptop } = await account()
        laptop.token = accessToken(Date.now())
        laptop.storage.newest = 2

        expect(await startOver(laptop)).toEqual({ kind: "rolled-back" })
        expect(laptop.storage.pending).toBeNull()
        expect(idp.key?.generation).toBe(1)
    })

    it("once the IdP took the key, it has started over: a failure after is reported, never thrown, and redone at the next check", async () => {
        const { idp, fresh } = await account()
        const report = vi.fn()
        const deps = { ...fresh.deps, report }
        vi.spyOn(deps.deviceDirectoryPort, "approveByPassphrase").mockRejectedValueOnce(new TypeError("Failed to fetch"))

        const outcome = await startOverUseCase(deps)({ idpUrl: IDP, accessToken: fresh.token, actorUri: ACTOR, tokenArrivedAt: Date.now() })

        expect(outcome).toEqual({ kind: "started-over", generation: 2, words: fresh.storage.kept?.words })
        expect(report).toHaveBeenCalledWith("approving this device by its new words", expect.any(TypeError))
        expect(idp.log).toContain("key packages")
        expect(fresh.storage.newWords).toBe(2)

        // A reload: the words are still to show, and the page load's check approves it.
        const reloaded = historyDevice(idp, "fresh", fresh.storage)
        reloaded.token = fresh.token
        expect(await reloaded.e2ee.newWordsToShow()).toEqual({ generation: 2, words: fresh.storage.kept?.words })
        expect(await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)).toEqual({ kind: "holds", generation: 2, settled: true })
        await reloaded.e2ee.dismissNewWords()
        expect(await reloaded.e2ee.newWordsToShow()).toBeNull()
    })

    it("pressed again before the new words were gone past, it answers them — never a second start over, nor a password", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        const { idp, fresh } = await account()
        const first = await startOver(fresh)
        vi.setSystemTime(Date.now() + 20 * 60_000)
        fresh.token = accessToken(Date.now() - 20 * 60_000)
        expect(signedInRecently(fresh.token)).toBe(false)

        expect(await startOver(fresh, null)).toEqual(first)
        expect(idp.key?.generation).toBe(2)
        expect(idp.log.filter((line) => line.startsWith("set key"))).toEqual(["set key 2"])
    })

    it("another generation landing before it approved itself: key-changed, its words no longer to show", async () => {
        const { idp, fresh } = await account()
        idp.onApprove = () => {
            idp.onApprove = null
            idp.key = { ...idp.key!, generation: 3, salt: new Uint8Array(16).fill(7), setByDevice: "rival" }
        }

        expect(await startOver(fresh)).toEqual({ kind: "key-changed" })
        expect(await fresh.e2ee.newWordsToShow()).toBeNull()
    })
})

describe("a pending generation past 1, at the next start", () => {
    /** A start over whose PUT never reached the IdP, or whose answer was lost: the pending key stays. */
    async function cutShort(landed: boolean) {
        const accounts = await account()
        const { idp, fresh } = accounts
        vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            if (landed) await FakeHistoryIdp.prototype.setKey.apply(idp, args)
            throw new TypeError("Failed to fetch")
        })
        await expect(startOver(fresh)).rejects.toThrow("Failed to fetch")
        expect(fresh.storage.pending?.key.generation).toBe(2)
        return { ...accounts, reloaded: historyDevice(idp, "fresh", fresh.storage) }
    }

    it("the older key in force: erased once it isn't fresh any more, never sent again by itself", async () => {
        const { idp, fresh, reloaded } = await cutShort(false)
        reloaded.token = fresh.token
        fresh.storage.pending!.mintedAt = Date.now() - PENDING_KEY_FRESH_MS - 1_000
        const setKey = vi.spyOn(idp, "setKey")
        setKey.mockClear()

        await nameSession(reloaded)
        expect(await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)).toEqual({ kind: "no-passphrase", generation: 1 })

        expect(setKey).not.toHaveBeenCalled()
        expect(fresh.storage.pending).toBeNull()
        expect(fresh.storage.kept).toBeNull()
        expect(idp.key?.generation).toBe(1)
    })

    it("in force already: kept, approved and reported — the start over happened", async () => {
        const { idp, fresh, reloaded } = await cutShort(true)
        reloaded.token = fresh.token

        await nameSession(reloaded)
        expect(await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)).toEqual({ kind: "holds", generation: 2, settled: true })

        expect(fresh.storage.pending).toBeNull()
        expect(idp.reports.get(fresh.storage.deviceId)).toBe(2)
        expect(idp.log.filter((line) => line === "set key 2")).toHaveLength(1)
    })

    it("written moments ago — another tab's PUT may be on its way —, a settle leaves it for a later one", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        const { idp, fresh, reloaded } = await cutShort(false)
        reloaded.token = fresh.token
        await nameSession(reloaded)

        await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)
        expect(fresh.storage.pending?.key.generation).toBe(2)

        vi.setSystemTime(Date.now() + PENDING_KEY_FRESH_MS + 1_000)
        await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)
        expect(fresh.storage.pending).toBeNull()
        expect(idp.key?.generation).toBe(1)
    })

    it("tried again in the same page load, it sends the same words", async () => {
        const { idp, fresh } = await cutShort(false)
        const pending = fresh.storage.pending!.words

        expect(await startOver(fresh)).toEqual({ kind: "started-over", generation: 2, words: pending })
        expect(idp.key?.generation).toBe(2)
    })
})

describe("two tabs of one device", () => {
    it("under the account's lock, a second tab's settle waits for the first tab's PUT", async () => {
        const { idp, fresh } = await account()
        const lock = sharedLock()
        const tabA = { ...fresh, deps: { ...fresh.deps, pendingKeyLock: lock } }
        const other = historyDevice(idp, "fresh", fresh.storage)
        other.token = fresh.token
        const tabB = { ...other, deps: { ...other.deps, pendingKeyLock: lock } }
        const answered = deferred<void>()
        const setKey = vi.spyOn(idp, "setKey").mockImplementationOnce(async (...args) => {
            await answered.promise
            return FakeHistoryIdp.prototype.setKey.apply(idp, args)
        })
        fresh.storage.pending = null

        const running = startOverUseCase(tabA.deps)({ idpUrl: IDP, accessToken: tabA.token, actorUri: ACTOR, tokenArrivedAt: Date.now() })
        await vi.waitFor(() => expect(setKey).toHaveBeenCalledOnce())
        // Even a row old enough to erase: tab B never reads it while tab A holds the lock.
        fresh.storage.pending!.mintedAt = Date.now() - PENDING_KEY_FRESH_MS - 1_000
        let settled = false
        const checking = checkHistoryKeyUseCase(tabB.deps)(IDP, tabB.token, ACTOR).then((standing) => {
            settled = true
            return standing
        })
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(settled).toBe(false)
        expect(fresh.storage.pending).not.toBeNull()

        answered.resolve()
        expect(await running).toMatchObject({ kind: "started-over", generation: 2 })
        expect(await checking).toMatchObject({ kind: "holds", generation: 2 })
        expect(fresh.storage.kept?.generation).toBe(2)
    })
})

describe("afterwards", () => {
    const enrolledWithToken = async (a: Awaited<ReturnType<typeof sharingAccount>>, name: string) => {
        const made = a.device(name)
        made.token = accessToken(Date.now(), name)
        a.net.enrol(made, "Chrome on Linux")
        return made
    }
    const accept = (device: SharingDevice) => acceptHistoryShareUseCase(device.deps)(IDP, device.token, ACTOR)

    it("holds n+1, is approved and in, and shares it with an old device that asks once they approved each other", async () => {
        const a = await sharingAccount(hpke, issuers)
        const fresh = await enrolledWithToken(a, "fresh")

        expect(await startOver(fresh)).toMatchObject({ kind: "started-over", generation: 2 })
        expect(a.net.rows.get(fresh.storage.deviceId)?.history_generation).toBe(2)
        expect(a.idp.approvals.at(-1)).toEqual({ deviceId: fresh.storage.deviceId, generation: 2 })
        expect(fresh.storage.admission).toEqual({ kind: "in", by: "passphrase" })
        expect(await a.laptop.e2ee.checkHistoryKey(IDP, a.laptop.token)).toMatchObject({ kind: "mismatch", reason: "check-value", held: 1 })

        // The old laptop asks, the device that started over answers through its Door; once approved back, it shares.
        await a.handshake(a.laptop, fresh)
        await a.refresh(fresh)

        expect(a.shares.posted).toEqual([{ sender: fresh.storage.deviceId, recipient: a.laptop.storage.deviceId, generation: 2 }])
        expect(await accept(a.laptop)).toEqual({ kind: "kept", generation: 2 })
        expect(a.laptop.storage.kept?.words).toEqual(fresh.storage.kept?.words)
    })

    it("shares at once with a partner it approved before: “It wasn't me” from the laptop", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 1 })
        a.laptop.token = accessToken(Date.now(), "laptop")
        a.net.alsoSignedIn(a.laptop.token, a.laptop)

        expect(await startOver(a.laptop)).toMatchObject({ kind: "started-over", generation: 2 })

        expect(a.shares.posted.at(-1)).toEqual({ sender: a.laptop.storage.deviceId, recipient: a.phone.storage.deviceId, generation: 2 })
        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 2 })
    })

    it("a share it can't send now waits for the next refresh: the start over still answers its words", async () => {
        const a = await sharingAccount(hpke, issuers)
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        await accept(a.phone)
        a.laptop.token = accessToken(Date.now(), "laptop")
        a.net.alsoSignedIn(a.laptop.token, a.laptop)
        a.shares.refuseNext(new IdpError(503, "unavailable", "unavailable"))

        expect(await startOver(a.laptop)).toMatchObject({ kind: "started-over", generation: 2 })
        expect(a.phone.storage.kept?.generation).toBe(1)
    })
})

describe("the devices listed as a device starts acting", () => {
    async function threeDevices() {
        const a = await sharingAccount(hpke, issuers)
        await a.handshake(a.phone, a.laptop)
        const tablet = await a.enrolled("tablet", "Safari on iPadOS")
        return { a, tablet }
    }
    const listed = (a: Awaited<ReturnType<typeof threeDevices>>["a"]) => [...a.net.rows.values()]

    it("a start over takes them as seen, and as from before but its handshake partners; its new words' screen names those", async () => {
        const { a, tablet } = await threeDevices()

        expect(await startOver(a.laptop)).toMatchObject({ kind: "started-over", generation: 2 })

        const trust = a.laptop.storage.trust
        expect(trust.baselines).toContain(2)
        expect(trust.seen.map((d) => d.deviceId)).toEqual(expect.arrayContaining([a.phone.storage.deviceId, tablet.storage.deviceId]))
        expect(trust.before.map((b) => [b.generation, b.cause, b.devices.map((d) => [d.deviceId, [...d.rootKey]]), b.refused])).toEqual([
            [2, "start-over", [[tablet.storage.deviceId, [...tablet.storage.rootKey.publicKey]]], []],
        ])
        expect(await devicesFromBeforeUseCase(a.laptop.deps)(IDP, a.laptop.token, ACTOR)).toEqual({ cause: "start-over", labels: ["Safari on iPadOS"] })

        const verdict = await a.laptop.e2ee.reviewDevices(IDP, a.laptop.token, ACTOR, listed(a))
        expect(verdict.before?.devices.map((d) => d.deviceId)).toEqual([tablet.storage.deviceId])
        expect(a.laptop.e2ee.trustSnapshot()).toContainEqual(expect.objectContaining({ deviceId: tablet.storage.deviceId, arrived: false }))
    })

    it("a start over keeps the device the user refused apart: never named on the words' screen", async () => {
        const { a, tablet } = await threeDevices()

        expect(await startOverUseCase(a.laptop.deps)({ idpUrl: IDP, accessToken: a.laptop.token, actorUri: ACTOR, refused: tablet.storage.deviceId })).toMatchObject({
            kind: "started-over",
        })

        expect(a.laptop.storage.trust.before[0].devices).toEqual([])
        expect(a.laptop.storage.trust.before[0].refused.map((d) => d.deviceId)).toEqual([tablet.storage.deviceId])
        expect(await devicesFromBeforeUseCase(a.laptop.deps)(IDP, a.laptop.token, ACTOR)).toBeNull()
    })

    it("a replacement takes them as seen, and as from before those it had found approved — a newcomer still waits", async () => {
        const { a, tablet } = await threeDevices()
        await restoreHistoryFromPassphraseUseCase(tablet.deps)({ idpUrl: IDP, accessToken: tablet.token, actorUri: ACTOR, passphrase: a.words })
        const newcomer = await a.enrolled("newcomer", "Chrome on Android")
        await a.laptop.e2ee.reviewDevices(IDP, a.laptop.token, ACTOR, listed(a))
        const replaced = await replaceWordsUseCase({ ...a.laptop.deps, cacheRead: () => true, applyRestored: async () => undefined })({
            idpUrl: IDP,
            accessToken: a.laptop.token,
            actorUri: ACTOR,
            tokenArrivedAt: Date.now(),
        })

        expect(replaced).toMatchObject({ kind: "replaced", generation: 2 })
        expect(a.laptop.storage.trust.baselines).toContain(2)
        expect(a.laptop.storage.trust.before.map((b) => [b.cause, b.devices.map((d) => d.deviceId)])).toEqual([["replacement", [tablet.storage.deviceId]]])
        expect(await devicesFromBeforeUseCase(a.laptop.deps)(IDP, a.laptop.token, ACTOR)).toEqual({ cause: "replacement", labels: ["Safari on iPadOS"] })
        const verdict = a.laptop.e2ee.verdictSnapshot()
        expect(waitingDevices({ devices: listed(a), events: a.laptop.e2ee.trustSnapshot(), verdict, requests: [] }).map((d) => d.device_id)).toEqual([
            newcomer.storage.deviceId,
        ])
    })

    it("a start over whose answer was lost keeps them as from before when the next start settles it, the refused device apart", async () => {
        const { a, tablet } = await threeDevices()
        const watch = await a.enrolled("watch", "Wear OS")
        const refused = tablet.storage.deviceId
        vi.spyOn(a.idp, "setKey").mockImplementationOnce(async (...args) => {
            await FakeHistoryIdp.prototype.setKey.apply(a.idp, args)
            throw new TypeError("Failed to fetch")
        })
        await expect(startOverUseCase(a.laptop.deps)({ idpUrl: IDP, accessToken: a.laptop.token, actorUri: ACTOR, refused })).rejects.toThrow(
            "Failed to fetch",
        )
        expect(a.laptop.storage.pending?.intent).toEqual({ cause: "start-over", refused })
        expect(a.laptop.storage.trust.before).toEqual([])

        const reloaded = a.device("laptop", a.laptop.storage)
        reloaded.token = a.laptop.token
        await checkHistoryKeyUseCase(reloaded.deps)(IDP, reloaded.token, ACTOR)

        expect(a.laptop.storage.pending).toBeNull()
        const [entry] = a.laptop.storage.trust.before
        expect([entry.generation, entry.cause, entry.devices.map((d) => d.deviceId), entry.refused.map((d) => d.deviceId)]).toEqual([
            2,
            "start-over",
            [watch.storage.deviceId],
            [tablet.storage.deviceId],
        ])
    })

    it("a review that landed before the from-before row is refreshed once the row is written: nobody from before left waiting", async () => {
        const { a, tablet } = await threeDevices()
        const set = await startOver(a.laptop)
        expect(set).toMatchObject({ kind: "started-over", generation: 2 })
        a.laptop.storage.trust = { ...a.laptop.storage.trust, before: [] }
        const early = await a.laptop.e2ee.reviewDevices(IDP, a.laptop.token, ACTOR, listed(a))
        expect(early.before).toBeNull()

        await a.laptop.e2ee.takeDeviceBaseline(2, listed(a), { cause: "start-over", refused: null })

        const verdict = a.laptop.e2ee.verdictSnapshot()
        expect(verdict?.before?.devices.map((d) => d.deviceId)).toEqual([tablet.storage.deviceId])
        expect(waitingDevices({ devices: listed(a), events: a.laptop.e2ee.trustSnapshot(), verdict, requests: [] })).toEqual([])
    })

    it("typed words take them as seen: a device listed before announces nothing, one listed after arrives", async () => {
        const { a, tablet } = await threeDevices()
        const typing = await a.enrolled("typing", "Chrome on Linux")
        await restoreHistoryFromPassphraseUseCase(typing.deps)({ idpUrl: IDP, accessToken: typing.token, actorUri: ACTOR, passphrase: a.words })
        const later = await a.enrolled("later", "Firefox on Android")

        await typing.e2ee.reviewDevices(IDP, typing.token, ACTOR, listed(a))

        const told = typing.e2ee.trustSnapshot().flatMap((e) => (e.kind === "unapproved-device" ? [[e.deviceId, e.arrived]] : []))
        expect(told).toEqual(expect.arrayContaining([[tablet.storage.deviceId, false], [later.storage.deviceId, true]]))
        expect(typing.storage.trust.before).toEqual([])
    })

    it("a first review under a generation no flow took the baseline for takes it: nothing listed then arrives", async () => {
        const { a, tablet } = await threeDevices()
        a.laptop.storage.trust = { ...a.laptop.storage.trust, baselines: [] }

        await a.laptop.e2ee.reviewDevices(IDP, a.laptop.token, ACTOR, listed(a))

        expect(a.laptop.e2ee.trustSnapshot()).toContainEqual(expect.objectContaining({ deviceId: tablet.storage.deviceId, arrived: false }))
        expect(a.laptop.storage.trust.baselines).toEqual([1])
    })
})
