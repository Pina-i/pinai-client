/**
 * Key shares (`identity-provider/specs/e2ee.md § 3.11`): the bytes against the IdP's golden vectors,
 * the rules, then real E2EE engines with the bundle's HPKE over fakes of the relay, the device list
 * and the share routes keeping the IdP's rules. The code approves a new device, its approver shares
 * right after, and the new device keeps the words only once all four checks hold, approves itself,
 * reports, and restores the archive in the background. A sender shares only with a partner whose
 * chain verifies from the root key the exchange gave; a share failing any check is left unused, and
 * either side warns. Refusals for good are never sent again; a new generation is shared again; after
 * a start over, the new device shares with the old one it approved.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { approvalBytes, deviceHpkeKeyBytes, shareAad, shareSignedBytes } from "@pinai/crypto/canonical-bytes"
import { openKeyShare, sealKeyShare } from "@pinai/crypto/key-share"
import type { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import type { HandshakePartner, TrustEvent } from "@pinai/domain/models/device-trust"
import { dueRestore } from "@pinai/domain/models/history-key"
import { IdpError } from "@pinai/domain/models/idp-error"
import {
    KEY_SHARE_INFO,
    shareCandidates,
    shareRefusal,
    shareText,
    shareWords,
    type KeyShare,
} from "@pinai/domain/models/key-share"
import { AwaitedShare, acceptHistoryShareUseCase, type ShareAcceptance } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { approveByPassphraseUseCase } from "@pinai/domain/usecases/e2ee/approve-by-passphrase.usecase"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { checkHistoryKeyUseCase } from "@pinai/domain/usecases/e2ee/check-history-key.usecase"
import { HistoryRestore } from "@pinai/domain/usecases/e2ee/restore-due-history.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { shareHistoryKeyUseCase } from "@pinai/domain/usecases/e2ee/share-history-key.usecase"
import { syncOwnGroupsUseCase } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"
import { parseKeyShare } from "@pinai/api/e2ee/key-share-api.adapter"

import { ACTOR, IDP } from "./setup/history-idp"
import { FakeIssuers, listedDevice, testDevice } from "./setup/issuers"
import { CONVERSATION, bundleHpke, sharingAccount, type SharingAccount, type SharingDevice } from "./setup/key-shares"

const issuers = new FakeIssuers()
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
let hpke: MlsAdapter

beforeAll(async () => {
    hpke = await bundleHpke()
})

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
    vi.restoreAllMocks()
})

const account = () => sharingAccount(hpke, issuers)

function heard(device: SharingDevice): TrustEvent[] {
    const stood: TrustEvent[] = []
    device.e2ee.onTrustEvent((event) => stood.push(event))
    return stood
}

const accept = (device: SharingDevice) => acceptHistoryShareUseCase(device.deps)(IDP, device.token, ACTOR)
const share = (device: SharingAccount["laptop"], a: SharingAccount) => shareHistoryKeyUseCase(a.sharing(device))(IDP, device.token, ACTOR)
const listed = (a: SharingAccount) => [...a.net.rows.values()].map((row) => ({ ...row, approvals: [...row.approvals] }))

describe("a share's bytes", () => {
    it("binds the account, both devices and the generation as the IdP's golden vectors write them", () => {
        const sender = "550e8400-e29b-41d4-a716-446655440000"
        const recipient = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
        const aad = shareAad("https://idp.alice.test/users/alice_xk9mp", sender, recipient, 12)

        expect(text(aad)).toBe(
            "PINAI-HISTORY-SHARE-v1\n" +
                "https://idp.alice.test/users/alice_xk9mp\n" +
                "550e8400-e29b-41d4-a716-446655440000\n" +
                "6ba7b810-9dad-11d1-80b4-00c04fd430c8\n" +
                "12",
        )
        expect(text(shareSignedBytes(aad, new Uint8Array(32).fill(1), new TextEncoder().encode("sealed words")))).toBe(
            "PINAI-HISTORY-SHARE-v1\n" +
                "https://idp.alice.test/users/alice_xk9mp\n" +
                "550e8400-e29b-41d4-a716-446655440000\n" +
                "6ba7b810-9dad-11d1-80b4-00c04fd430c8\n" +
                "12\n" +
                "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=\n" +
                "c2VhbGVkIHdvcmRz",
        )
    })

    it("seals the words lowercase, single-spaced, under its own info and aad: base mode, a 32-byte enc", async () => {
        const recipient = await hpke.generateKeyPair()
        const root = ed25519.keygen()
        const words = generateMnemonic(wordlist, 256).toUpperCase().split(" ")
        const sealed = await sealKeyShare({
            hpke,
            actorUri: ACTOR,
            sender: "s",
            recipient: "r",
            generation: 3,
            words,
            recipientHpkeKey: recipient.publicKey,
            senderRootSecret: root.secretKey,
        })
        const aad = shareAad(ACTOR, "s", "r", 3)

        expect(sealed.enc).toHaveLength(32)
        expect(sealed.ciphertext.length).toBeLessThanOrEqual(1024)
        expect(ed25519.verify(sealed.signature, shareSignedBytes(aad, sealed.enc, sealed.ciphertext), root.publicKey)).toBe(true)
        const opened = await hpke.open(recipient.privateKey, sealed, Uint8Array.from(new TextEncoder().encode(KEY_SHARE_INFO)), aad)
        expect(text(opened)).toBe(words.join(" ").toLowerCase())
        await expect(hpke.open(recipient.privateKey, sealed, Uint8Array.from(new TextEncoder().encode("other")), aad)).rejects.toThrow()
        await expect(hpke.open(recipient.privateKey, sealed, Uint8Array.from(new TextEncoder().encode(KEY_SHARE_INFO)), shareAad(ACTOR, "s", "r", 4))).rejects.toThrow()

        const share: KeyShare = { ...sealed, senderDeviceId: "s", createdAt: "2026-11-04T00:00:00Z" }
        const open = (change: Partial<Parameters<typeof openKeyShare>[0]>) =>
            openKeyShare({ hpke, actorUri: ACTOR, recipient: "r", share, senderRootKeys: [root.publicKey], hpkePrivateKey: recipient.privateKey, ...change })
        expect(await open({})).toEqual({ ok: true, words: words.map((w) => w.toLowerCase()) })
        expect(await open({ recipient: "another" })).toEqual({ ok: false, reason: "signature" })
        expect(await open({ senderRootKeys: [ed25519.keygen().publicKey] })).toEqual({ ok: false, reason: "signature" })
    })

    it("reads the waiting share's bytes at their sizes, its sender lowercase, and refuses any other", () => {
        const body = {
            sender_device_id: "550E8400-E29B-41D4-A716-446655440000",
            generation: 2,
            enc: bytesToBase64(new Uint8Array(32).fill(1)),
            ciphertext: bytesToBase64(new Uint8Array(100).fill(2)),
            signature: bytesToBase64(new Uint8Array(64).fill(3)),
            created_at: "2026-11-04T00:00:00Z",
        }
        expect(parseKeyShare(body)).toMatchObject({ senderDeviceId: "550e8400-e29b-41d4-a716-446655440000", generation: 2 })
        expect(parseKeyShare({ ...body, enc: bytesToBase64(new Uint8Array(31)) })).toBeNull()
        expect(parseKeyShare({ ...body, ciphertext: bytesToBase64(new Uint8Array(1025)) })).toBeNull()
        expect(parseKeyShare({ ...body, signature: "not base64!" })).toBeNull()
        expect(parseKeyShare({ ...body, generation: 0 })).toBeNull()
        expect(parseKeyShare({ ...body, sender_device_id: "laptop" })).toBeNull()
    })
})

describe("the rules", () => {
    const partner = (deviceId: string, root: number): HandshakePartner => ({
        deviceId,
        rootKey: new Uint8Array(32).fill(root),
        hpkeKey: new Uint8Array(32).fill(root + 100),
    })
    const row = (deviceId: string, root: number, change: Partial<DeviceListEntry> = {}): DeviceListEntry =>
        ({
            ...listedDevice(testDevice(issuers, ACTOR, deviceId)),
            drk_public_key: new Uint8Array(32).fill(root),
            approvals: [{ by: "device", device_id: "me", signature: new Uint8Array(64), created_at: "2026-11-04T00:00:00Z" }],
            ...change,
        }) as DeviceListEntry
    const byPhone = { by: "device", device_id: "phone", signature: new Uint8Array(64), created_at: "2026-11-04T00:00:00Z" } as const
    const me = (approvals: DeviceListEntry["approvals"] = [byPhone]) => row("me", 1, { approvals })
    const pick = (devices: DeviceListEntry[], change: Partial<Parameters<typeof shareCandidates>[0]> = {}) =>
        shareCandidates({
            partners: [partner("phone", 2)],
            devices: [me(), ...devices],
            thisDevice: "me",
            generation: 1,
            revokedSeen: [],
            forgone: () => false,
            ...change,
        })

    it("shares with a partner listed unrevoked, not holding the generation, approved by this device and approving it back", () => {
        const { candidates } = pick([row("phone", 2)])
        expect(candidates.map((c) => [c.partner.deviceId, c.byThisDevice.length, c.byPartner.length])).toEqual([["phone", 1, 1]])
    })

    it("passes over a partner that hasn't approved this device back: its handshake never finished on its side", () => {
        expect(pick([], { devices: [me([]), row("phone", 2)] })).toEqual({ candidates: [], refused: [] })
    })

    it("passes over a partner revoked, seen revoked, holding the generation, forgone, unlisted or not approved by it, saying nothing", () => {
        const none = { candidates: [], refused: [] }
        expect(pick([row("phone", 2, { revoked_at: "2026-11-04T00:00:00Z" })])).toEqual(none)
        expect(pick([row("phone", 2)], { revokedSeen: ["phone"] })).toEqual(none)
        expect(pick([row("phone", 2, { history_generation: 1 })])).toEqual(none)
        expect(pick([row("phone", 2)], { forgone: (id, generation) => id === "phone" && generation === 1 })).toEqual(none)
        expect(pick([])).toEqual(none)
        expect(pick([row("phone", 2, { approvals: [] })])).toEqual(none)
        expect(pick([row("phone", 2), row("phone", 2)])).toEqual(none)
        expect(pick([row("me", 1)])).toEqual(none)
    })

    it("refuses a partner the list shows under another root key than the exchange gave, whoever approved it", () => {
        expect(pick([row("phone", 9)])).toEqual({ candidates: [], refused: [{ deviceId: "phone", reason: "root-key" }] })
        expect(pick([row("phone", 9, { approvals: [] })]).refused).toEqual([{ deviceId: "phone", reason: "root-key" }])
    })

    it("writes the words as a BIP-39 mnemonic and takes back only 24 lowercase words, single-spaced", () => {
        const words = generateMnemonic(wordlist, 256).split(" ")
        expect(shareText([" Abandon", ...words.slice(1)])).toBe(["abandon", ...words.slice(1)].join(" "))
        expect(shareWords(words.join(" "))).toEqual(words)
        expect(shareWords(words.slice(1).join(" "))).toBeNull()
        expect(shareWords(words.join("  "))).toBeNull()
        expect(shareWords(words.join(" ").toUpperCase())).toBeNull()
    })

    it("tells the instance's refusals apart by their code: final, stale, or for later", () => {
        const means = (status: number, code: string) => shareRefusal(new IdpError(status, code, "refused"))
        expect(means(409, "history_key_held")).toBe("final")
        expect(means(409, "not_the_approver")).toBe("final")
        expect(means(403, "access_denied")).toBe("final")
        expect(means(404, "not_found")).toBe("final")
        expect(means(400, "invalid_request")).toBe("final")
        expect(means(409, "stale_history_key")).toBe("stale")
        for (const code of ["not_approved", "no_hpke_key", "no_root_key", "history_key_not_held", "device_required"]) {
            expect(means(409, code)).toBe("later")
        }
        expect(means(503, "")).toBe("later")
        expect(shareRefusal(new TypeError("Failed to fetch"))).toBe("later")
    })

    it("restores while the device holds the generation it was due under, drops it once a later one is in force", () => {
        expect(dueRestore(1, { kind: "holds", generation: 1, settled: true })).toBe("restore")
        expect(dueRestore(1, { kind: "holds", generation: 2, settled: true })).toBe("moot")
        expect(dueRestore(1, { kind: "mismatch", generation: 2, setByDevice: null, reason: "check-value", held: 1 })).toBe("moot")
        expect(dueRestore(1, { kind: "no-passphrase", generation: 1 })).toBe("wait")
        expect(dueRestore(1, { kind: "unchecked" })).toBe("wait")
    })
})

describe("the wait for a share", () => {
    const waitingOn = (...answers: Array<ShareAcceptance | Error>) => {
        const accept = vi.fn(async () => {
            const next = answers.shift() ?? { kind: "none" as const }
            if (next instanceof Error) throw next
            return next
        })
        return { awaited: new AwaitedShare(accept, vi.fn()), accept }
    }

    it("ends kept once the words are, or once the device holds them anyway", async () => {
        for (const answer of [{ kind: "kept", generation: 1 } as const, { kind: "holds" } as const]) {
            const { awaited } = waitingOn({ kind: "none" }, answer)
            await awaited.tick()
            expect(awaited.state).toEqual({ kind: "waiting" })
            await awaited.tick()
            expect(awaited.state).toEqual({ kind: "kept" })
        }
    })

    it("ends on a share failing a check — the same one would again —, never on one it couldn't settle", async () => {
        const unsettled = waitingOn({ kind: "refused", reason: "unsettled" })
        await unsettled.awaited.tick()
        expect(unsettled.awaited.state).toEqual({ kind: "waiting" })

        const refused = waitingOn({ kind: "refused", reason: "check-value" })
        await refused.awaited.tick()
        expect(refused.awaited.state).toEqual({ kind: "unusable", reason: "check-value" })
        await refused.awaited.tick()
        expect(refused.accept).toHaveBeenCalledOnce()
    })

    it("ends only for `device_mismatch` or a revoked device, and backs off 2 → 4 → 8 s otherwise, from the start again once approved", async () => {
        const mismatched = new IdpError(403, "device_mismatch", "x")
        const ended = waitingOn(mismatched)
        await ended.awaited.tick()
        expect(ended.awaited.state).toEqual({ kind: "ended", error: mismatched })

        const { awaited } = waitingOn(new IdpError(409, "not_approved", "x"), new IdpError(503, "", "x"), { kind: "none" })
        const delays: number[] = []
        for (let i = 0; i < 3; i++) {
            await awaited.tick()
            delays.push(awaited.nextDelay())
        }
        expect(awaited.state).toEqual({ kind: "waiting" })
        expect(delays).toEqual([2_000, 4_000, 8_000])
        await awaited.again()
        expect(awaited.nextDelay()).toBe(2_000)
    })
})

describe("approving a new device with a code, end to end (§ 6.10)", () => {
    it("the approver shares right after; the new device keeps the words, approves itself, reports, and restores the archive", async () => {
        const a = await account()
        const { idp, shares, laptop, phone } = a
        await a.archive(laptop, ["first", "second"])

        await a.handshake(phone, laptop)
        // Right after its approval the phone hadn't approved it back: nothing went.
        expect(shares.posted).toEqual([])
        await a.refresh(laptop)

        expect(shares.posted).toEqual([{ sender: laptop.storage.deviceId, recipient: phone.storage.deviceId, generation: 1 }])
        expect(shares.pushes).toEqual([phone.storage.deviceId])

        expect(await accept(phone)).toEqual({ kind: "kept", generation: 1 })
        expect(phone.storage.kept?.words).toEqual(laptop.storage.kept?.words)
        expect(idp.approvals.map((x) => x.deviceId)).toEqual([laptop.storage.deviceId, phone.storage.deviceId])
        expect(idp.reports.get(phone.storage.deviceId)).toBe(1)
        expect(a.net.rows.get(phone.storage.deviceId)?.history_generation).toBe(1)
        expect(shares.held(phone.storage.deviceId)).toBeNull()
        expect(idp.log).toContain("key packages")
        expect(await phone.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 1, settled: true })
        const checked = await checkAdmissionUseCase(phone.deps)(IDP, phone.token, ACTOR)
        expect(checked.admission).toEqual({ kind: "in", by: "passphrase" })

        expect(phone.storage.restoreDue).toEqual({ generation: 1, appliedAt: null })
        const applied = vi.fn()
        const restored = await new HistoryRestore({ e2ee: phone.e2ee }).run({ idpUrl: IDP, accessToken: () => phone.token }, applied)
        expect(restored).toMatchObject({ kind: "restored", generation: 1, messages: 2, skipped: 0 })
        expect(applied.mock.calls[0][0].map((m: { conversationId: string; text: string }) => [m.conversationId, m.text])).toEqual([
            [CONVERSATION, "first"],
            [CONVERSATION, "second"],
        ])
        expect(phone.storage.restoreDue).toMatchObject({ generation: 1, appliedAt: expect.any(String) })

        // Holding the words, the phone acts: the laptop holds them too, so it shares with nobody.
        expect(await share(phone, a)).toEqual({ shared: [], forgone: [], failed: [] })
    })

    it("shares only after the device it approved approves it back: an asker gone mid-way gets nothing, another approver's share is taken", async () => {
        const a = await account()
        const { laptop, phone } = a
        const tablet = await a.enrolled("tablet", "Safari on iPad")
        const typed = await restoreHistoryFromPassphraseUseCase(tablet.deps)({ idpUrl: IDP, accessToken: tablet.token, actorUri: ACTOR, passphrase: a.words })
        expect(typed).toEqual({ kind: "kept", generation: 1 })

        // The phone sends its keys (message 5), and its tab closes before it approves the laptop back.
        await a.handshake(phone, laptop, { leavesEarly: true })
        expect(a.net.rows.get(phone.storage.deviceId)?.approvals.map((x) => x.by === "device" && x.device_id)).toEqual([laptop.storage.deviceId])
        await a.refresh(laptop)
        expect(a.shares.posted).toEqual([])

        // The user tries again, from the tablet.
        await a.handshake(phone, tablet)
        await a.refresh(laptop)
        await a.refresh(tablet)
        expect(a.shares.posted).toEqual([{ sender: tablet.storage.deviceId, recipient: phone.storage.deviceId, generation: 1 }])
        expect(await accept(phone)).toEqual({ kind: "kept", generation: 1 })
    })

    it("warns of an approval the list shows that doesn't verify, and shares nothing over it", async () => {
        const a = await account()
        await a.handshake(a.phone, a.laptop, { sharing: false })
        const laptopRow = a.net.rows.get(a.laptop.storage.deviceId)!
        a.net.list({ ...laptopRow, approvals: laptopRow.approvals.map((x) => ({ ...x, signature: new Uint8Array(64) })) })
        const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined)
        warned.mockClear()

        expect(await a.laptop.e2ee.sealHistoryShares(ACTOR, listed(a))).toEqual([])
        const lines = warned.mock.calls.map((c) => String(c[0]))
        expect(lines.some((line) => line.startsWith("[e2ee] the list shows an approval by it of this device that doesn't verify"))).toBe(true)
    })

    it("takes the share only after publishing its KeyPackages, then shares on itself", async () => {
        const a = await account()
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        const register = vi.mocked(a.phone.e2ee.register)
        const seal = vi.spyOn(a.phone.e2ee, "sealHistoryShares")

        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 1 })
        expect(register.mock.invocationCallOrder[0]).toBeLessThan(seal.mock.invocationCallOrder[0])
    })

    it("leaves a share alone, keeping nothing, when the key in force is older than one it has seen", async () => {
        const a = await account()
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        a.phone.storage.newest = 2

        expect(await accept(a.phone)).toEqual({ kind: "stale" })
        expect(a.phone.storage.kept).toBeNull()
        expect(a.phone.storage.restoreDue).toBeNull()
    })

    it("leaves alone a share served for another generation than the key in force, and takes none while it holds the key", async () => {
        const a = await account()
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        const stood = heard(a.phone)
        const waiting = await a.shares.waiting(IDP, a.phone.token)
        const relabelled = { share: async () => undefined, waiting: async () => ({ ...waiting!, generation: 2 }) }

        const served = await acceptHistoryShareUseCase({ ...a.phone.deps, keySharePort: relabelled })(IDP, a.phone.token, ACTOR)

        expect(served).toEqual({ kind: "stale" })
        expect(a.phone.storage.kept).toBeNull()
        expect(stood.filter((e) => e.kind === "share-refused")).toEqual([])
        expect(await accept(a.laptop)).toEqual({ kind: "holds" })
    })
})

describe("accepting a share: each of the four checks", () => {
    /** The phone, a partner of the laptop by the code, its share replaced by what the instance serves. */
    async function waiting(served: (a: SharingAccount) => Promise<KeyShare>) {
        const a = await account()
        await a.handshake(a.phone, a.laptop, { sharing: false })
        const stood = heard(a.phone)
        a.shares.plant(a.phone.storage.deviceId, await served(a))
        return { ...a, stood }
    }

    async function sealed(
        a: SharingAccount,
        change: { from?: string; signer?: Uint8Array; forKey?: Uint8Array; words?: string[] } = {},
    ): Promise<KeyShare> {
        const out = await sealKeyShare({
            hpke,
            actorUri: ACTOR,
            sender: change.from ?? a.laptop.storage.deviceId,
            recipient: a.phone.storage.deviceId,
            generation: 1,
            words: change.words ?? a.words,
            recipientHpkeKey: change.forKey ?? a.phone.storage.hpkeKey.publicKey,
            senderRootSecret: change.signer ?? a.laptop.storage.rootKey.secretKey,
        })
        return { ...out, senderDeviceId: change.from ?? a.laptop.storage.deviceId, createdAt: "2026-11-04T00:00:00Z" }
    }

    function nothingKept(a: SharingAccount & { stood: TrustEvent[] }, reason: string, from = a.laptop.storage.deviceId) {
        expect(a.phone.storage.kept).toBeNull()
        expect(a.phone.storage.restoreDue).toBeNull()
        expect(a.idp.reports.has(a.phone.storage.deviceId)).toBe(false)
        expect(a.shares.held(a.phone.storage.deviceId)).not.toBeNull()
        expect(a.stood).toContainEqual({ kind: "share-refused", deviceId: from, generation: 1, reason })
    }

    it("takes the words from its partner once all four hold", async () => {
        const a = await waiting((a) => sealed(a))
        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 1 })
        expect(a.stood.filter((e) => e.kind === "share-refused")).toEqual([])
    })

    it("1. refuses a sender that isn't its partner, its share otherwise sound", async () => {
        let tablet!: SharingDevice
        const a = await waiting(async (a) => {
            tablet = await a.enrolled("tablet", "Safari on iPad")
            return sealed(a, { from: tablet.storage.deviceId, signer: tablet.storage.rootKey.secretKey })
        })
        expect(await accept(a.phone)).toEqual({ kind: "refused", reason: "not-a-partner" })
        nothingKept(a, "not-a-partner", tablet.storage.deviceId)
    })

    it("2. refuses a signature by the root key the list swapped in for its partner", async () => {
        const swapped = ed25519.keygen()
        const a = await waiting(async (a) => {
            const laptopRow = a.net.rows.get(a.laptop.storage.deviceId)!
            a.net.list({ ...laptopRow, drk_public_key: swapped.publicKey })
            return sealed(a, { signer: swapped.secretKey })
        })
        expect(await accept(a.phone)).toEqual({ kind: "refused", reason: "signature" })
        nothingKept(a, "signature")
    })

    it("3. refuses a seal for another key, signed by its partner", async () => {
        const a = await waiting(async (a) => sealed(a, { forKey: (await hpke.generateKeyPair()).publicKey }))
        expect(await accept(a.phone)).toEqual({ kind: "refused", reason: "seal" })
        nothingKept(a, "seal")
    })

    it("4. refuses words that don't give the key's check value, nor its approval key", async () => {
        const other = generateMnemonic(wordlist, 256).split(" ")
        const wrong = await waiting((a) => sealed(a, { words: other }))
        expect(await accept(wrong.phone)).toEqual({ kind: "refused", reason: "check-value" })
        nothingKept(wrong, "check-value")

        const swappedKey = await waiting(async (a) => {
            a.idp.key = { ...a.idp.key!, approvalPublicKey: ed25519.keygen().publicKey }
            return sealed(a)
        })
        expect(await accept(swappedKey.phone)).toEqual({ kind: "refused", reason: "approval-key" })
        nothingKept(swappedKey, "approval-key")
    })

    it("refuses a partner seen revoked, and withdraws its warnings once the device holds the words", async () => {
        const a = await waiting((a) => sealed(a))
        const withdrawn: TrustEvent[] = []
        a.phone.e2ee.onTrustWithdrawn((event) => withdrawn.push(event))
        await a.phone.storage.asStorage().addToDeviceTrust({ revoked: [a.laptop.storage.deviceId] })
        expect(await accept(a.phone)).toEqual({ kind: "refused", reason: "not-a-partner" })

        a.phone.storage.trust = { ...a.phone.storage.trust, revoked: [] }
        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 1 })
        expect(withdrawn).toContainEqual({ kind: "share-refused", deviceId: a.laptop.storage.deviceId, generation: 1, reason: "not-a-partner" })
        expect(a.phone.e2ee.trustSnapshot().filter((e) => e.kind === "share-refused")).toEqual([])
    })
})

describe("the sender", () => {
    /** The laptop and the phone partners by the code, nothing shared yet. */
    async function partners() {
        const a = await account()
        await a.handshake(a.phone, a.laptop, { sharing: false })
        return { ...a, stood: heard(a.laptop) }
    }

    /** The phone's row as the instance lists it, its keys `root`'s, approved by the laptop over them. */
    function rowUnder(a: SharingAccount, root: { secretKey: Uint8Array; publicKey: Uint8Array }, hpkeSigner = root.secretKey): DeviceListEntry {
        const phoneId = a.phone.storage.deviceId
        const attestation = issuers.attest(ACTOR, phoneId, root.publicKey)
        const hpkeKey = a.phone.storage.hpkeKey.publicKey
        const signature = ed25519.sign(approvalBytes(ACTOR, phoneId, root.publicKey), a.laptop.storage.rootKey.secretKey)
        return {
            ...a.net.rows.get(phoneId)!,
            drk_public_key: root.publicKey,
            attestation_signature: attestation.signature,
            attestation_kid: attestation.kid,
            attestation_expires_at: attestation.expires_at,
            hpke_public_key: hpkeKey,
            hpke_key_signature: ed25519.sign(deviceHpkeKeyBytes(ACTOR, phoneId, hpkeKey), hpkeSigner),
            approvals: [{ by: "device", device_id: a.laptop.storage.deviceId, signature, created_at: "2026-11-04T00:00:00Z" }],
        }
    }

    it("seals for the HPKE key the list shows, once its chain verifies from the root key the exchange gave, writing nothing it keeps", async () => {
        const a = await partners()
        const kept = a.laptop.storage.trust
        const sealedFor = await a.laptop.e2ee.sealHistoryShares(ACTOR, listed(a))
        expect(sealedFor.map((s) => [s.recipientDeviceId, s.generation])).toEqual([[a.phone.storage.deviceId, 1]])
        expect(a.stood).toEqual([])
        expect(a.laptop.storage.trust).toBe(kept)
    })

    it("shares nothing, and warns, when the list shows another root key than the exchange gave", async () => {
        const a = await partners()
        a.net.list(rowUnder(a, ed25519.keygen()))

        expect(await a.laptop.e2ee.sealHistoryShares(ACTOR, listed(a))).toEqual([])
        expect(a.stood).toContainEqual({ kind: "share-recipient-refused", deviceId: a.phone.storage.deviceId, reason: "root-key" })
    })

    it("shares nothing, and warns, when that root key didn't sign the HPKE key listed", async () => {
        const a = await partners()
        a.net.list(rowUnder(a, a.phone.storage.rootKey, ed25519.keygen().secretKey))

        expect(await a.laptop.e2ee.sealHistoryShares(ACTOR, listed(a))).toEqual([])
        expect(a.stood).toContainEqual({ kind: "share-recipient-refused", deviceId: a.phone.storage.deviceId, reason: "hpke-key" })

        // Listed right again, it passes, and the warning goes.
        a.net.list(rowUnder(a, a.phone.storage.rootKey))
        expect(await a.laptop.e2ee.sealHistoryShares(ACTOR, listed(a))).toHaveLength(1)
        expect(a.laptop.e2ee.trustSnapshot().filter((e) => e.kind === "share-recipient-refused")).toEqual([])
    })

    it("shares nothing with a partner revoked — and goes on refusing it once listed unrevoked — nor with one holding the generation", async () => {
        const a = await partners()
        const phoneRow = a.net.rows.get(a.phone.storage.deviceId)!
        a.net.list({ ...phoneRow, revoked_at: "2026-11-04T00:00:00Z" })
        expect(await a.laptop.e2ee.sealHistoryShares(ACTOR, listed(a))).toEqual([])
        // The review keeps the list's revocations; sealing only reads them.
        await a.laptop.e2ee.reviewDevices(IDP, a.laptop.token, ACTOR, listed(a))
        a.net.list({ ...phoneRow, revoked_at: null })
        expect(await a.laptop.e2ee.sealHistoryShares(ACTOR, listed(a))).toEqual([])

        const b = await partners()
        b.net.list({ ...b.net.rows.get(b.phone.storage.deviceId)!, history_generation: 1 })
        expect(await b.laptop.e2ee.sealHistoryShares(ACTOR, listed(b))).toEqual([])
        expect([...a.stood, ...b.stood]).toEqual([])
    })

    it("shares nothing while it doesn't hold the generation, settled", async () => {
        const a = await partners()
        a.laptop.storage.kept = { ...a.laptop.storage.kept!, approvedRootKey: null }
        await a.laptop.e2ee.checkHistoryKey(IDP, a.laptop.token)
        expect(await a.laptop.e2ee.sealHistoryShares(ACTOR, listed(a))).toEqual([])
    })

    it("shares on each refresh of the list, through the sync's review, again harmlessly", async () => {
        const a = await partners()
        const sync = () =>
            syncOwnGroupsUseCase(IDP, a.laptop.token, ACTOR, [], {
                e2ee: a.laptop.e2ee,
                deviceDirectory: a.shares.directory(),
                sharing: a.sharing(a.laptop),
            })

        expect(await sync()).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [] })
        expect(await sync()).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [] })
        expect(a.shares.posted).toHaveLength(2)
        expect(a.shares.pushes).toEqual([a.phone.storage.deviceId])
    })

    it("shares after the sync's adds", async () => {
        const order: string[] = []
        const step = (what: string, answer: unknown = undefined) => vi.fn(async () => (order.push(what), answer))
        const verdict = { acting: true, generation: 1, thisDevice: "laptop", listed: [], approved: [], unsettled: [] }
        await syncOwnGroupsUseCase(IDP, "tok", ACTOR, ["g1"], {
            e2ee: {
                catchUp: step("catch up"),
                refreshOwnLeaf: step("refresh", { refreshed: false }),
                reviewDevices: step("review", verdict),
                removeUntrustedLeaves: step("drop", { removed: 0 }),
                addOwnDevices: step("add", { added: 0, unclaimed: [] }),
            } as never,
            deviceDirectory: { listDevices: step("list", { devices: [] }) } as never,
            sharing: {
                e2ee: { sealHistoryShares: step("seal", []), forgoHistoryShare: vi.fn(), checkHistoryKey: vi.fn() },
                keyShares: { share: vi.fn(), waiting: vi.fn() },
                deviceDirectory: { listDevices: vi.fn() },
            } as never,
        })
        expect(order).toEqual(["catch up", "refresh", "list", "review", "drop", "add", "seal"])
    })
})

describe("the instance's refusals", () => {
    async function partners() {
        const a = await account()
        await a.handshake(a.phone, a.laptop, { sharing: false })
        return a
    }

    it.each(["history_key_held", "not_the_approver"])("never sends again, under that generation, a share refused with %s", async (code) => {
        const a = await partners()
        a.shares.refuseNext(new IdpError(409, code, code))

        expect(await share(a.laptop, a)).toEqual({ shared: [], forgone: [a.phone.storage.deviceId], failed: [] })
        expect(await share(a.laptop, a)).toEqual({ shared: [], forgone: [], failed: [] })
        expect(a.shares.posted).toHaveLength(1)
    })

    it("sends once a call one that may yet pass — not approved yet, an instance out of reach —, and again at the next", async () => {
        const a = await partners()
        const notApproved = new IdpError(409, "not_approved", "not approved")
        const down = new IdpError(503, "", "unavailable")
        a.shares.refuseNext(notApproved)
        expect(await share(a.laptop, a)).toEqual({ shared: [], forgone: [], failed: [{ deviceId: a.phone.storage.deviceId, error: notApproved }] })
        a.shares.refuseNext(down)
        expect((await share(a.laptop, a)).failed).toEqual([{ deviceId: a.phone.storage.deviceId, error: down }])
        expect(await share(a.laptop, a)).toEqual({ shared: [a.phone.storage.deviceId], forgone: [], failed: [] })
        expect(a.shares.posted).toHaveLength(3)
    })

    it("reads the key again on stale_history_key and sends nothing more", async () => {
        const a = await partners()
        const tablet = await a.enrolled("tablet", "Safari on iPad")
        await a.handshake(tablet, a.laptop, { sharing: false })
        a.shares.refuseNext(new IdpError(409, "stale_history_key", "stale"))
        const checks = vi.spyOn(a.laptop.e2ee, "checkHistoryKey")

        const outcome = await share(a.laptop, a)

        expect(outcome.shared).toEqual([])
        expect(outcome.failed).toHaveLength(1)
        expect(a.shares.posted).toHaveLength(1)
        expect(checks).toHaveBeenCalledOnce()
    })
})

describe("a new generation", () => {
    it("is shared again with the partner holding the one before, which takes it", async () => {
        const a = await account()
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        await accept(a.phone)

        const { key } = await a.laptop.e2ee.mintHistoryKey(2)
        await a.idp.setKey(IDP, a.laptop.token, key)
        await a.laptop.e2ee.promotePendingHistoryKey()
        // Coming to hold it, settled at the next check, it shares it.
        await checkHistoryKeyUseCase(a.laptop.deps)(IDP, a.laptop.token, ACTOR)

        expect(a.shares.posted.map((p) => p.generation)).toEqual([1, 2])
        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 2 })
        expect(a.phone.storage.kept?.words).toEqual(a.laptop.storage.kept?.words)
        expect(a.net.rows.get(a.phone.storage.deviceId)?.history_generation).toBe(2)
    })
})

describe("after a start over (§ 6.11)", () => {
    it("the new device answers the old one's request, then shares the new passphrase with it", async () => {
        const a = await account()
        const tablet = a.laptop
        const fresh = await a.enrolled("new", "Chrome on Linux")
        const { key } = await fresh.e2ee.mintHistoryKey(2)
        await a.idp.setKey(IDP, fresh.token, key)
        await fresh.e2ee.promotePendingHistoryKey()
        await approveByPassphraseUseCase(fresh.deps)(IDP, fresh.token, ACTOR)
        expect(await tablet.e2ee.checkHistoryKey(IDP, tablet.token)).toMatchObject({ kind: "mismatch", reason: "check-value", held: 1 })

        await a.handshake(tablet, fresh)
        await a.refresh(fresh)

        expect(a.shares.posted).toEqual([{ sender: fresh.storage.deviceId, recipient: tablet.storage.deviceId, generation: 2 }])
        expect(await accept(tablet)).toEqual({ kind: "kept", generation: 2 })
        expect(await tablet.e2ee.historyKeyStanding()).toEqual({ kind: "holds", generation: 2, settled: true })
        expect(a.idp.approvals.at(-1)).toEqual({ deviceId: tablet.storage.deviceId, generation: 2 })
    })
})

describe("the background restore", () => {
    async function kept() {
        const a = await account()
        await a.archive(a.laptop, ["first"])
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)
        await accept(a.phone)
        return a
    }
    const context = (device: SharingDevice) => ({ idpUrl: IDP, accessToken: () => device.token })

    it("runs once a page load: two calls are one run, and a later call none", async () => {
        const a = await kept()
        const reads = vi.spyOn(a.idp, "downloadPage")
        const restore = new HistoryRestore({ e2ee: a.phone.e2ee })
        const apply = vi.fn()

        await Promise.all([restore.run(context(a.phone), apply), restore.run(context(a.phone), apply)])
        await restore.run(context(a.phone), apply)

        expect(reads).toHaveBeenCalledOnce()
        expect(apply).toHaveBeenCalledOnce()
        expect(restore.state).toMatchObject({ kind: "restored", messages: 1 })
    })

    it("stays due once applied, and is done only when the next page load, its cache read back, runs it again, showing nothing", async () => {
        const a = await kept()
        const apply = vi.fn()
        await new HistoryRestore({ e2ee: a.phone.e2ee }).run(context(a.phone), apply)
        expect(a.phone.storage.restoreDue).toMatchObject({ generation: 1, appliedAt: expect.any(String) })

        const reloaded = a.device("phone", a.phone.storage)
        const next = new HistoryRestore({ e2ee: reloaded.e2ee, cacheReady: async () => undefined })
        const told = vi.fn()
        next.onChange(told)
        await next.run(context(reloaded), apply)

        expect(apply).toHaveBeenCalledTimes(2)
        expect(apply.mock.calls[1][0]).toEqual(apply.mock.calls[0][0])
        expect(told).not.toHaveBeenCalled()
        expect(a.phone.storage.restoreDue).toBeNull()
    })

    it("applies nothing before the cache was read back, and stays due when it never is", async () => {
        const a = await kept()
        const apply = vi.fn()
        const restore = new HistoryRestore({ e2ee: a.phone.e2ee, cacheReady: () => new Promise(() => undefined) })
        vi.useFakeTimers()

        void restore.run(context(a.phone), apply)
        await vi.advanceTimersByTimeAsync(60_000)
        vi.useRealTimers()

        expect(apply).not.toHaveBeenCalled()
        expect(a.phone.storage.restoreDue).toEqual({ generation: 1, appliedAt: null })
    })

    it("stays due after a failure, not run again that page load, and runs at the next start", async () => {
        const a = await kept()
        vi.spyOn(a.idp, "downloadPage").mockRejectedValueOnce(new TypeError("Failed to fetch"))
        const restore = new HistoryRestore({ e2ee: a.phone.e2ee })
        const apply = vi.fn()

        expect(await restore.run(context(a.phone), apply)).toMatchObject({ kind: "failed", generation: 1 })
        await restore.run(context(a.phone), apply)
        expect(apply).not.toHaveBeenCalled()
        expect(a.phone.storage.restoreDue).toEqual({ generation: 1, appliedAt: null })

        const reloaded = a.device("phone", a.phone.storage)
        expect(await new HistoryRestore({ e2ee: reloaded.e2ee }).run(context(reloaded), apply)).toMatchObject({ kind: "restored", messages: 1 })
        expect(a.phone.storage.restoreDue).toMatchObject({ generation: 1, appliedAt: expect.any(String) })
    })

    it("stays due, never marked applied, when its messages can't be applied", async () => {
        const a = await kept()
        const failing = vi.fn(() => {
            throw new Error("the store refused")
        })
        expect(await new HistoryRestore({ e2ee: a.phone.e2ee }).run(context(a.phone), failing)).toMatchObject({ kind: "failed" })
        expect(a.phone.storage.restoreDue).toEqual({ generation: 1, appliedAt: null })
    })

    it("is dropped once a later generation is in force: its archive is gone", async () => {
        const a = await kept()
        const elsewhere = await a.enrolled("elsewhere", "Edge on Windows")
        await a.idp.setKey(IDP, elsewhere.token, (await elsewhere.e2ee.mintHistoryKey(2)).key)
        await a.phone.e2ee.checkHistoryKey(IDP, a.phone.token)
        const reads = vi.spyOn(a.idp, "downloadPage")

        await new HistoryRestore({ e2ee: a.phone.e2ee }).run(context(a.phone), vi.fn())

        expect(reads).not.toHaveBeenCalled()
        expect(a.phone.storage.restoreDue).toBeNull()
    })
})
