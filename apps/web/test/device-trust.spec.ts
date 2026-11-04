/**
 * Which of the account's devices each device trusts, decided by itself (`identity-provider/specs/e2ee.md
 * § 3.9`): approvals checked under the approval key it derived, two links at most, each bound to
 * a device's id and root key; a list naming an id twice refused; revocations final; and only by a
 * device holding the current passphrase. The rules are the domain's, the signatures real, the
 * review the real E2EE engine's.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { checkListedDevices, verifyApproval } from "@pinai/crypto/attestation-chain.adapter"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import {
    approvedDevices,
    duplicateDeviceIds,
    emptyDeviceTrust,
    firstToCommitOut,
    judgeDevices,
    judgeLeaf,
    keyChangedUnder,
    ownLeafStanding,
    resetByUnapproved,
    resetSince,
    trustEventKey,
    unapprovedListed,
    undecided,
    withTrust,
    type CheckedApproval,
    type CheckedDevice,
    type DeviceTrustVerdict,
    type TrustEvent,
} from "@pinai/domain/models/device-trust"
import { devicesToAdd } from "@pinai/domain/models/group"
import { asActorUri } from "@pinai/domain/models/identity"
import type { LeafVerdict } from "@pinai/domain/models/leaf-trust"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"

import { ACTOR, FakeHistoryIdp, FastSealer, IDP, MemoryHistoryStorage, historyDevice } from "./setup/history-idp"
import { FakeIssuers, approvedBy, approvedByPassphrase, listedDevice, testDevice, type TestDevice } from "./setup/issuers"

afterEach(() => {
    vi.restoreAllMocks()
})

const root = (n: number) => new Uint8Array(32).fill(n)

describe("the approval rule", () => {
    const byPassphrase = (generation = 2): CheckedApproval => ({ by: "passphrase", generation, verifies: true })
    const byDevice = (approver: string, n: number): CheckedApproval => ({ by: "device", approver, approverRootKey: root(n), verifies: true })
    const device = (deviceId: string, n: number, approvals: CheckedApproval[], change: Partial<CheckedDevice> = {}): CheckedDevice => ({
        deviceId,
        displayName: deviceId,
        rootKey: root(n),
        revoked: false,
        chain: "ok",
        approvals,
        ...change,
    })
    const ids = (devices: CheckedDevice[], revokedSeen: string[] = []) =>
        approvedDevices(devices, 2, revokedSeen).map((d) => d.deviceId)

    it("approves by the generation's approval key, or by a device so approved: two links, never three", () => {
        const devices = [
            device("laptop", 1, [byPassphrase()]),
            device("phone", 2, [byDevice("laptop", 1)]),
            device("tablet", 3, [byDevice("phone", 2)]),
        ]

        expect(ids(devices)).toEqual(["laptop", "phone"])
        expect(approvedDevices(devices, 2, [])[1]).toEqual({ deviceId: "phone", rootKey: root(2) })
    })

    it("matches an approving device by its id and the root key it was approved over, never its id alone", () => {
        expect(ids([device("laptop", 1, [byPassphrase()]), device("phone", 2, [byDevice("laptop", 9)])])).toEqual(["laptop"])
    })

    it("approves nobody from a list naming a device id twice", () => {
        const devices = [device("laptop", 9, [], { chain: "failed" }), device("laptop", 1, [byPassphrase()]), device("phone", 2, [byDevice("laptop", 1)])]

        expect(duplicateDeviceIds(devices.map((d) => d.deviceId))).toEqual(["laptop"])
        expect(ids(devices)).toEqual([])
    })

    it("takes no approval that didn't verify, nor one by a past generation's key", () => {
        expect(ids([device("laptop", 1, [{ by: "passphrase", generation: 2, verifies: false }])])).toEqual([])
        expect(ids([device("laptop", 1, [byPassphrase(1)])])).toEqual([])
        expect(ids([device("laptop", 1, [byPassphrase()]), device("phone", 2, [{ ...byDevice("laptop", 1), verifies: false }])])).toEqual([
            "laptop",
        ])
    })

    it("lets no revoked device approve or be approved, the list's revocations or those seen before", () => {
        const devices = [device("laptop", 1, [byPassphrase()], { revoked: true }), device("phone", 2, [byDevice("laptop", 1)])]
        expect(ids(devices)).toEqual([])

        const listedUnrevoked = [device("laptop", 1, [byPassphrase()]), device("phone", 2, [byDevice("laptop", 1)])]
        expect(ids(listedUnrevoked, ["laptop"])).toEqual([])
        expect(ids(listedUnrevoked, ["phone"])).toEqual(["laptop"])
    })

    it("counts no device whose chain doesn't verify, or couldn't be settled", () => {
        expect(ids([device("laptop", 1, [byPassphrase()], { chain: "failed" })])).toEqual([])
        expect(ids([device("laptop", 1, [byPassphrase()], { chain: "unsettled" })])).toEqual([])
        expect(ids([device("laptop", 1, [byPassphrase()], { rootKey: null })])).toEqual([])
    })

    it("never takes a device's approval of itself for a second link", () => {
        expect(ids([device("phone", 2, [byDevice("phone", 2)])])).toEqual([])
    })
})

describe("what a review judges and keeps", () => {
    const checked = (deviceId: string, n: number, change: Partial<CheckedDevice> = {}): CheckedDevice => ({
        deviceId,
        displayName: deviceId,
        rootKey: root(n),
        revoked: false,
        chain: "ok",
        approvals: [],
        ...change,
    })
    const laptop = checked("laptop", 1, { approvals: [{ by: "passphrase", generation: 1, verifies: true }] })
    const judge = (devices: CheckedDevice[], trust = emptyDeviceTrust(), ownRootKey: Uint8Array | null = root(1)) =>
        judgeDevices({ devices, generation: 1, trust, thisDevice: "laptop", ownRootKey })

    it("keeps only what is new, and is the very same record when nothing is", () => {
        const trust = withTrust(emptyDeviceTrust(), { seen: [{ deviceId: "a", rootKey: root(1) }], revoked: ["b", "b"] })

        expect(trust).toEqual({ seen: [{ deviceId: "a", rootKey: root(1) }], approved: [], revoked: ["b"], partners: [] })
        expect(withTrust(trust, { seen: [{ deviceId: "a", rootKey: root(1) }], revoked: ["b"] })).toBe(trust)
        expect(withTrust(trust, { seen: [{ deviceId: "a", rootKey: root(2) }] }).seen).toHaveLength(2)

        const partner = { deviceId: "c", rootKey: root(3), hpkeKey: root(4) }
        const partnered = withTrust(trust, { partners: [partner] })
        expect(withTrust(partnered, { partners: [{ ...partner }] })).toBe(partnered)
        expect(withTrust(partnered, { partners: [{ ...partner, hpkeKey: root(5) }] }).partners).toHaveLength(2)
    })

    it("counts itself approved, keeps what it saw and found approved, and keeps the unsettled apart", () => {
        const judged = judge([laptop, checked("phone", 2), checked("tablet", 3, { chain: "unsettled" }), checked("old", 4, { chain: "failed" })])

        expect(judged.approved).toEqual([{ deviceId: "laptop", rootKey: root(1) }])
        expect(judge([checked("phone", 2)]).approved).toEqual([{ deviceId: "laptop", rootKey: root(1) }])
        expect(judge([checked("phone", 2)], emptyDeviceTrust(), null).approved).toEqual([])
        expect(judged.unsettled).toEqual([{ deviceId: "tablet", rootKey: root(3) }])
        expect(judged.keep).toEqual({
            seen: [
                { deviceId: "laptop", rootKey: root(1) },
                { deviceId: "phone", rootKey: root(2) },
            ],
            approved: [{ deviceId: "laptop", rootKey: root(1) }],
        })
    })

    it("holds every unapproved device, arriving only the first time it is seen under that root key", () => {
        const seen = withTrust(emptyDeviceTrust(), { seen: [{ deviceId: "phone", rootKey: root(2) }] })
        const unapproved = (devices: CheckedDevice[], trust = emptyDeviceTrust()) =>
            judge(devices, trust).unapproved.map((d) => [d.deviceId, d.arrived])

        expect(unapproved([laptop, checked("phone", 2)])).toEqual([["phone", true]])
        expect(unapproved([laptop, checked("phone", 2)], seen)).toEqual([["phone", false]])
        expect(unapproved([laptop, checked("phone", 3)], seen)).toEqual([["phone", true]])
        expect(unapproved([checked("phone", 2, { revoked: true })])).toEqual([])
        expect(unapproved([checked("phone", 2)], withTrust(emptyDeviceTrust(), { revoked: ["phone"] }))).toEqual([])
        expect(unapproved([checked("phone", 2, { chain: "unsettled" })])).toEqual([])
    })

    it("tells a reset from a device it found approved over the root key listed now from any other", () => {
        const trust = withTrust(emptyDeviceTrust(), { approved: [{ deviceId: "phone", rootKey: root(2) }], revoked: ["old"] })
        const listed = [
            { deviceId: "phone", rootKey: root(2) },
            { deviceId: "tablet", rootKey: root(3) },
        ]
        const reset = (setByDevice: string | null) => ({ generation: 2, setByDevice })

        expect(resetByUnapproved(reset("phone"), listed, trust, "laptop", null)).toBe(false)
        expect(resetByUnapproved(reset("tablet"), listed, trust, "laptop", null)).toBe(true)
        expect(resetByUnapproved(reset("phone"), [{ deviceId: "phone", rootKey: root(9) }], trust, "laptop", null)).toBe(true)
        expect(resetByUnapproved(reset("old"), listed, trust, "laptop", null)).toBe(true)
        expect(resetByUnapproved(reset(null), listed, trust, "laptop", null)).toBe(true)
    })

    it("warns of a reset attributed to this very device unless it is setting that generation", () => {
        const reset = { generation: 2, setByDevice: "laptop" }

        expect(resetByUnapproved(reset, [], emptyDeviceTrust(), "laptop", 2)).toBe(false)
        expect(resetByUnapproved(reset, [], emptyDeviceTrust(), "laptop", null)).toBe(true)
        expect(resetByUnapproved(reset, [], emptyDeviceTrust(), "laptop", 3)).toBe(true)
    })

    it("sees a reset in a generation past the one held, or, holding none, past the newest seen", () => {
        const key = { generation: 3, salt: root(0), checkValue: root(1), approvalPublicKey: root(2), setByDevice: "tablet" }

        expect(resetSince(key, 2, 3)).toEqual({ generation: 3, setByDevice: "tablet" })
        expect(resetSince(key, 3, 3)).toBeNull()
        expect(resetSince(key, null, 2)).toEqual({ generation: 3, setByDevice: "tablet" })
        expect(resetSince(key, null, null)).toBeNull()
        expect(resetSince(null, 2, 2)).toBeNull()
    })

    it("tells a key changed under the generation held, its approval key or its salt and check value", () => {
        const mismatch = (reason: "check-value" | "approval-key" | "rollback", held: number | null) =>
            keyChangedUnder({ kind: "mismatch", generation: 2, setByDevice: null, reason, held })

        expect(mismatch("approval-key", 2)).toEqual({ kind: "approval-key-differs", generation: 2 })
        expect(mismatch("check-value", 2)).toEqual({ kind: "key-replaced", generation: 2 })
        expect(mismatch("check-value", 1)).toBeNull()
        expect(mismatch("rollback", 2)).toBeNull()
        expect(keyChangedUnder({ kind: "holds", generation: 2, settled: true })).toBeNull()
    })

    it("keys each event by what it is about", () => {
        const device = { kind: "unapproved-device", deviceId: "phone", displayName: "Phone", rootKey: root(2) } as const
        expect(trustEventKey({ ...device, arrived: true })).toBe(trustEventKey({ ...device, arrived: false, displayName: "Other" }))
        expect(trustEventKey({ ...device, arrived: true })).not.toBe(trustEventKey({ ...device, rootKey: root(3), arrived: true }))
        expect(trustEventKey({ kind: "approval-key-differs", generation: 2 })).toBe(trustEventKey({ kind: "key-replaced", generation: 2 }))
        expect(trustEventKey({ kind: "reset-by-unapproved", generation: 2, setByDevice: "a" })).not.toBe(
            trustEventKey({ kind: "reset-by-unapproved", generation: 3, setByDevice: "a" }),
        )
    })

    it("marks the listed devices an unapproved-device event stands for, by id and the root key listed now", () => {
        const event = { kind: "unapproved-device", deviceId: "phone", displayName: "Phone", rootKey: root(2), arrived: true } as const
        const listed = [
            { device_id: "phone", drk_public_key: root(2) },
            { device_id: "tablet", drk_public_key: root(3) },
        ]
        expect([...unapprovedListed([event], listed)]).toEqual(["phone"])
        expect([...unapprovedListed([event], [{ device_id: "phone", drk_public_key: root(9) }])]).toEqual([])
        expect([...unapprovedListed([{ kind: "device-list-refused", duplicates: ["phone"] }], listed)]).toEqual([])
    })
})

describe("what a verdict lets a device do", () => {
    const acting: DeviceTrustVerdict = {
        acting: true,
        generation: 1,
        thisDevice: "laptop",
        listed: [
            { deviceId: "laptop", rootKey: root(1) },
            { deviceId: "phone", rootKey: root(2) },
            { deviceId: "tablet", rootKey: root(3) },
            { deviceId: "watch", rootKey: root(5) },
        ],
        approved: [
            { deviceId: "laptop", rootKey: root(1) },
            { deviceId: "phone", rootKey: root(2) },
        ],
        unsettled: [{ deviceId: "watch", rootKey: root(5) }],
    }
    const verified = (deviceId: string, n: number, actorUri = ACTOR): LeafVerdict => ({ ok: true, actorUri, deviceId, rootKey: root(n) })
    const BOB = asActorUri("https://idp.test/users/bob_k2m9x")

    it("adds the approved devices no verified leaf stands for, never an unapproved one nor itself", () => {
        expect(devicesToAdd([verified("laptop", 1)], ACTOR, acting)).toEqual([{ deviceId: "phone", rootKey: root(2) }])
        expect(devicesToAdd([verified("laptop", 1), verified("phone", 2)], ACTOR, acting)).toEqual([])
    })

    it("doesn't take a leaf under another root key, of another account, or failing its checks for the device's own", () => {
        const phone = [{ deviceId: "phone", rootKey: root(2) }]
        expect(devicesToAdd([verified("phone", 9)], ACTOR, acting)).toEqual(phone)
        expect(devicesToAdd([verified("phone", 2, BOB)], ACTOR, acting)).toEqual(phone)
        expect(devicesToAdd([{ ok: false, reason: "binding" }], ACTOR, acting)).toEqual(phone)
    })

    it("adds nothing on a device that doesn't act on approval", () => {
        expect(devicesToAdd([], ACTOR, { ...acting, acting: false })).toEqual([])
        expect(devicesToAdd([], ACTOR, undecided("laptop", acting.listed))).toEqual([])
    })

    it("trusts a leaf of the account's own only over the root key its device was approved over, and leaves the unsettled be", () => {
        expect(ownLeafStanding(acting, { deviceId: "phone", rootKey: root(2) })).toBe("trusted")
        expect(ownLeafStanding(acting, { deviceId: "tablet", rootKey: root(3) })).toBe("not-approved")
        expect(ownLeafStanding(acting, { deviceId: "phone", rootKey: root(9) })).toBe("not-listed")
        expect(ownLeafStanding(acting, { deviceId: "watch", rootKey: root(5) })).toBe("unsettled")
    })

    it("commits out forgeries whoever the device, own leaves an acting device doesn't approve, and nothing else", () => {
        const forged: LeafVerdict = { ok: false, reason: "binding" }

        expect(judgeLeaf(forged, ACTOR, null)).toEqual({ outcome: "remove", reason: "binding", grounds: "forged" })
        expect(judgeLeaf({ ok: false, reason: "expired" }, ACTOR, null)).toEqual({ outcome: "warn", reason: "expired" })
        expect(judgeLeaf({ ok: false, reason: "unreachable" }, ACTOR, acting)).toEqual({ outcome: "unsettled" })
        expect(judgeLeaf(verified("bob-1", 7, BOB), ACTOR, acting)).toEqual({ outcome: "trusted" })
        expect(judgeLeaf(verified("phone", 2), ACTOR, acting)).toEqual({ outcome: "trusted" })
        expect(judgeLeaf(verified("tablet", 3), ACTOR, acting)).toEqual({ outcome: "remove", reason: "not-approved", grounds: "approval" })
        expect(judgeLeaf(verified("phone", 9), ACTOR, acting)).toEqual({ outcome: "remove", reason: "not-listed", grounds: "approval" })
        expect(judgeLeaf(verified("watch", 5), ACTOR, acting)).toEqual({ outcome: "unsettled" })
        expect(judgeLeaf(verified("tablet", 3), ACTOR, { ...acting, acting: false })).toEqual({ outcome: "unsettled" })
    })

    it("picks the first leaf to commit out the instance hasn't refused for good", () => {
        const remove = { outcome: "remove", reason: "binding", grounds: "forged" } as const
        const leaves = [
            { index: 0, judgement: { outcome: "trusted" } as const, refused: false },
            { index: 1, judgement: remove, refused: true },
            { index: 2, judgement: { outcome: "warn", reason: "expired" } as const, refused: false },
            { index: 3, judgement: remove, refused: false },
        ]

        expect(firstToCommitOut(leaves)?.index).toBe(3)
        expect(firstToCommitOut(leaves.slice(0, 3))).toBeNull()
    })
})

describe("approvals as a device checks them, with real keys", () => {
    const issuers = new FakeIssuers()
    const hak = crypto.getRandomValues(new Uint8Array(32))
    const approvalKey = new FastSealer().derive(hak).approvalPublicKey
    const [laptop, phone, tablet] = [1, 2, 3].map(() => testDevice(issuers, ACTOR))

    async function approved(devices: DeviceListEntry[], key = approvalKey, revokedSeen: string[] = []) {
        const checked = await checkListedDevices(ACTOR, devices, key, issuers.jwks)
        return approvedDevices(checked, 1, revokedSeen).map((d) => d.deviceId)
    }

    it("verifies an approval over the IdP's own canonical bytes", () => {
        const signer = ed25519.keygen()
        const golden = new TextEncoder().encode(
            "PINAI-DEVICE-APPROVAL-v1\n" +
                "https://idp.alice.test/users/alice_xk9mp\n" +
                "550e8400-e29b-41d4-a716-446655440000\n" +
                "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
        )
        const signature = ed25519.sign(golden, signer.secretKey)
        const verify = (rootKey: Uint8Array) =>
            verifyApproval(signature, "https://idp.alice.test/users/alice_xk9mp", "550e8400-e29b-41d4-a716-446655440000", rootKey, signer.publicKey)

        expect(verify(root(1))).toBe(true)
        expect(verify(root(2))).toBe(false)
    })

    it("approves one link by the approval key and two through a device, never three", async () => {
        const devices = [
            listedDevice(laptop, [approvedByPassphrase(hak, 1, laptop)]),
            listedDevice(phone, [approvedBy(laptop, phone)]),
            listedDevice(tablet, [approvedBy(phone, tablet)]),
        ]

        expect(await approved(devices)).toEqual([laptop.deviceId, phone.deviceId])
    })

    it("lets no instance-made key approve a device under an approved device's id, listed twice", async () => {
        const fakeLaptop = testDevice(issuers, ACTOR, laptop.deviceId)
        const evil = testDevice(issuers, ACTOR)
        const devices = [
            listedDevice(fakeLaptop, [], { attestation_signature: new Uint8Array(64), hpke_public_key: null, hpke_key_signature: null }),
            listedDevice(laptop, [approvedByPassphrase(hak, 1, laptop)]),
            listedDevice(evil, [approvedBy(fakeLaptop, evil)]),
        ]
        const checked = await checkListedDevices(ACTOR, devices, approvalKey, issuers.jwks)

        expect(approvedDevices(checked, 1, [])).toEqual([])
        // Were the list taken whole, the root key the approval was checked under would still not be the laptop's.
        expect(approvedDevices(checked.slice(1), 1, []).map((d) => d.deviceId)).toEqual([laptop.deviceId])
    })

    it("refuses an approval over another root key than the one listed", async () => {
        const other = ed25519.keygen().publicKey
        const devices = [
            listedDevice(laptop, [approvedByPassphrase(hak, 1, { ...laptop, rootKey: { ...laptop.rootKey, publicKey: other } })]),
            listedDevice(phone, [approvedBy(laptop, phone, other)]),
        ]

        expect(await approved(devices)).toEqual([])
    })

    it("lets a revoked approver approve nobody, listed revoked or seen revoked", async () => {
        const devices = [listedDevice(laptop, [approvedByPassphrase(hak, 1, laptop)]), listedDevice(phone, [approvedBy(laptop, phone)])]

        expect(await approved([{ ...devices[0], revoked_at: "2026-11-03T00:00:00Z" }, devices[1]])).toEqual([])
        expect(await approved(devices, approvalKey, [laptop.deviceId])).toEqual([])
    })

    it("refuses an approval by a key the server swapped in: only the key this device derived counts", async () => {
        const swapped = crypto.getRandomValues(new Uint8Array(32))
        const devices = [listedDevice(laptop, [approvedByPassphrase(swapped, 1, laptop)])]

        expect(await approved(devices)).toEqual([])
        expect(await approved(devices, new FastSealer().derive(swapped).approvalPublicKey)).toEqual([laptop.deviceId])
    })

    it("rests on the attestation alone: a device with no HPKE key can be approved, one attested falsely can't", async () => {
        const forged = listedDevice(laptop, [approvedByPassphrase(hak, 1, laptop)], { attestation_signature: new Uint8Array(64) })
        const noHpke = listedDevice(laptop, [approvedByPassphrase(hak, 1, laptop)], { hpke_public_key: null, hpke_key_signature: null })

        expect(await approved([forged])).toEqual([])
        expect(await approved([noHpke])).toEqual([laptop.deviceId])
    })

    it("leaves a chain its issuer can't be asked for, or whose attestation expired, unsettled", async () => {
        const down: IJwksCachePort = {
            getKey: async () => {
                throw new Error("unreachable")
            },
            invalidate: () => undefined,
        }
        const expired = testDevice(issuers, ACTOR)
        const lapsed = { ...expired, attestation: issuers.attest(ACTOR, expired.deviceId, expired.rootKey.publicKey, "2020-01-01T00:00:00Z") }

        const [unreachable] = await checkListedDevices(ACTOR, [listedDevice(laptop)], approvalKey, down)
        const [old] = await checkListedDevices(ACTOR, [listedDevice(lapsed)], approvalKey, issuers.jwks)

        expect([unreachable.chain, old.chain]).toEqual(["unsettled", "unsettled"])
    })
})

describe("reviewing the device list", () => {
    const issuers = new FakeIssuers()

    /** An account whose laptop set generation 1, holds it and approved itself; the laptop attested, as its list row says. */
    async function account() {
        const idp = new FakeHistoryIdp()
        const laptop = historyDevice(idp, "laptop", new MemoryHistoryStorage(), issuers.jwks)
        const outcome = await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
        if (outcome.kind !== "holds") throw new Error("the first device didn't set the key")
        const hak = await new FastSealer().deriveKey(outcome.words, idp.key!.salt)
        const self: TestDevice = {
            actorUri: ACTOR,
            deviceId: laptop.storage.deviceId,
            rootKey: laptop.storage.rootKey,
            attestation: issuers.attest(ACTOR, laptop.storage.deviceId, laptop.storage.rootKey.publicKey),
        }
        const laptopRow = listedDevice(self, [approvedByPassphrase(hak, 1, self)])
        return { idp, laptop, self, hak, laptopRow }
    }

    const review = (device: ReturnType<typeof historyDevice>, devices: DeviceListEntry[]) =>
        device.e2ee.reviewDevices(IDP, device.token, ACTOR, devices)

    function heard(device: ReturnType<typeof historyDevice>) {
        const stood: TrustEvent[] = []
        const withdrawn: TrustEvent[] = []
        device.e2ee.onTrustEvent((event) => stood.push(event))
        device.e2ee.onTrustWithdrawn((event) => withdrawn.push(event))
        return { stood, withdrawn }
    }

    const unapproved = (events: TrustEvent[]) => events.filter((e) => e.kind === "unapproved-device")

    it("acts on approval on a device holding the current passphrase: the approved devices, itself among them", async () => {
        const { laptop, self, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        const tablet = testDevice(issuers, ACTOR)

        const verdict = await review(laptop, [laptopRow, listedDevice(phone, [approvedBy(self, phone)]), listedDevice(tablet)])

        expect(verdict).toMatchObject({ acting: true, generation: 1 })
        expect(verdict.approved.map((d) => d.deviceId)).toEqual([self.deviceId, phone.deviceId])
        expect(devicesToAdd([], ACTOR, verdict).map((d) => d.deviceId)).toEqual([phone.deviceId])
        expect(laptop.storage.trust.approved.map((d) => d.deviceId)).toEqual([self.deviceId, phone.deviceId])
    })

    it("decides nothing on a device that doesn't hold the passphrase, and keeps the revocations it sees", async () => {
        const { idp, hak, laptopRow } = await account()
        const phone = historyDevice(idp, "phone", new MemoryHistoryStorage(), issuers.jwks)
        const tablet = testDevice(issuers, ACTOR)
        const { stood } = heard(phone)

        const verdict = await review(phone, [
            laptopRow,
            listedDevice(tablet, [approvedByPassphrase(hak, 1, tablet)]),
            listedDevice(testDevice(issuers, ACTOR), [], { revoked_at: "2026-11-03T00:00:00Z" }),
        ])

        expect(verdict).toMatchObject({ acting: false, generation: null, approved: [] })
        expect(devicesToAdd([], ACTOR, verdict)).toEqual([])
        expect(phone.storage.trust.seen).toEqual([])
        expect(phone.storage.trust.approved).toEqual([])
        expect(phone.storage.trust.revoked).toHaveLength(1)
        expect(stood).toEqual([])
    })

    it("decides nothing on a device whose derivation isn't the stored approval key, and warns", async () => {
        const { idp, laptop, laptopRow } = await account()
        idp.key = { ...idp.key!, approvalPublicKey: ed25519.keygen().publicKey }
        const { stood } = heard(laptop)

        const verdict = await review(laptop, [laptopRow, listedDevice(testDevice(issuers, ACTOR))])

        expect(verdict.acting).toBe(false)
        expect(stood).toEqual([{ kind: "approval-key-differs", generation: 1 }])
    })

    it("warns of a key replaced under the very generation it holds", async () => {
        const { idp, laptop, laptopRow } = await account()
        idp.key = { ...idp.key!, salt: root(7), checkValue: root(7) }
        const { stood } = heard(laptop)

        expect((await review(laptop, [laptopRow])).acting).toBe(false)
        expect(stood).toEqual([{ kind: "key-replaced", generation: 1 }])
        expect(laptop.e2ee.trustSnapshot()).toEqual(stood)
    })

    it("refuses a list naming a device id twice, decides nothing, and says so until a list doesn't", async () => {
        const { laptop, self, laptopRow } = await account()
        const fakeLaptop = testDevice(issuers, ACTOR, self.deviceId)
        const evil = testDevice(issuers, ACTOR)
        const { stood, withdrawn } = heard(laptop)

        const verdict = await review(laptop, [
            listedDevice(fakeLaptop, [], { attestation_signature: new Uint8Array(64) }),
            laptopRow,
            listedDevice(evil, [approvedBy(fakeLaptop, evil)]),
        ])

        expect(verdict).toEqual(undecided(self.deviceId))
        expect(stood).toEqual([{ kind: "device-list-refused", duplicates: [self.deviceId] }])
        expect(laptop.storage.trust).toEqual(emptyDeviceTrust())
        await review(laptop, [laptopRow])
        expect(withdrawn).toEqual(stood)
    })

    it("decides nothing when the revocations it kept can't be read", async () => {
        const { laptop, self, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        laptop.storage.unreadable = ["revoked"]

        const verdict = await review(laptop, [laptopRow, listedDevice(phone, [approvedBy(self, phone)])])

        expect(verdict.acting).toBe(false)
        expect(laptop.storage.trust.approved).toEqual([])
    })

    it("tells a device appearing unapproved as arriving once, holds it after a reload, and withdraws it once approved", async () => {
        const { idp, laptop, self, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        const devices = [laptopRow, listedDevice(phone, [], { hpke_public_key: null, hpke_key_signature: null })]
        const { stood, withdrawn } = heard(laptop)

        await review(laptop, devices)
        await review(laptop, devices)

        const standing = { kind: "unapproved-device", deviceId: phone.deviceId, displayName: "Chrome on Linux", rootKey: phone.rootKey.publicKey }
        expect(unapproved(stood)).toEqual([{ ...standing, arrived: true }])
        expect(unapproved(heard(laptop).stood)).toEqual([{ ...standing, arrived: true }])

        const reloaded = historyDevice(idp, "laptop", laptop.storage, issuers.jwks)
        await review(reloaded, devices)
        expect(unapproved(reloaded.e2ee.trustSnapshot())).toEqual([{ ...standing, arrived: false }])

        await review(laptop, [laptopRow, listedDevice(phone, [approvedBy(self, phone)])])
        expect(unapproved(withdrawn)).toEqual([{ ...standing, arrived: true }])
        expect(unapproved(laptop.e2ee.trustSnapshot())).toEqual([])
    })

    it("withdraws the devices it announced once it no longer acts: a device without the current passphrase announces nobody", async () => {
        const { idp, laptop, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        const devices = [laptopRow, listedDevice(phone)]
        const { withdrawn } = heard(laptop)
        await review(laptop, devices)
        expect(unapproved(laptop.e2ee.trustSnapshot())).toHaveLength(1)

        const other = historyDevice(idp, "elsewhere")
        await idp.session().linkDevice(IDP, other.token, other.storage.deviceId)
        await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey(2)).key)
        expect((await review(laptop, devices)).acting).toBe(false)

        expect(unapproved(laptop.e2ee.trustSnapshot())).toEqual([])
        expect(unapproved(withdrawn).map((e) => e.kind === "unapproved-device" && e.deviceId)).toEqual([phone.deviceId])
    })

    it("withdraws them the moment its own check finds it no longer holds the passphrase, review or not", async () => {
        const { idp, laptop, laptopRow } = await account()
        await review(laptop, [laptopRow, listedDevice(testDevice(issuers, ACTOR))])
        expect(unapproved(laptop.e2ee.trustSnapshot())).toHaveLength(1)

        idp.key = { ...idp.key!, approvalPublicKey: ed25519.keygen().publicKey }
        await laptop.e2ee.checkHistoryKey(IDP, laptop.token)

        expect(unapproved(laptop.e2ee.trustSnapshot())).toEqual([])
    })

    it("withdraws them on a list naming a device twice, which decides nothing", async () => {
        const { laptop, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        await review(laptop, [laptopRow, listedDevice(phone)])
        expect(unapproved(laptop.e2ee.trustSnapshot())).toHaveLength(1)

        await review(laptop, [laptopRow, listedDevice(phone), listedDevice(phone)])

        expect(unapproved(laptop.e2ee.trustSnapshot())).toEqual([])
    })

    it("takes a device whose root key changed for a new one: unapproved, arriving again", async () => {
        const { laptop, self, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        await review(laptop, [laptopRow, listedDevice(phone, [approvedBy(self, phone)])])
        const rotated = testDevice(issuers, ACTOR, phone.deviceId)
        const { stood } = heard(laptop)

        // The old approval, listed over the new root key, binds the old one only.
        const verdict = await review(laptop, [laptopRow, listedDevice(rotated, [approvedBy(self, phone)])])

        expect(verdict.approved.map((d) => d.deviceId)).toEqual([self.deviceId])
        expect(verdict.listed).toContainEqual({ deviceId: phone.deviceId, rootKey: rotated.rootKey.publicKey })
        expect(unapproved(stood)).toMatchObject([{ deviceId: phone.deviceId, rootKey: rotated.rootKey.publicKey, arrived: true }])
        expect(laptop.storage.trust.approved).toContainEqual({ deviceId: phone.deviceId, rootKey: phone.rootKey.publicKey })
    })

    it("keeps a revocation final when the list later shows the device unrevoked", async () => {
        const { laptop, self, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        await review(laptop, [laptopRow, listedDevice(phone, [approvedBy(self, phone)], { revoked_at: "2026-11-03T00:00:00Z" })])
        const { stood } = heard(laptop)

        const verdict = await review(laptop, [laptopRow, listedDevice(phone, [approvedBy(self, phone)])])

        expect(verdict.approved.map((d) => d.deviceId)).toEqual([self.deviceId])
        expect(ownLeafStanding(verdict, { deviceId: phone.deviceId, rootKey: phone.rootKey.publicKey })).toBe("not-approved")
        expect(stood).toEqual([])
    })

    it("holds a device whose chain can't be settled apart: neither approved nor told", async () => {
        const { laptop, self, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        const lapsed = { ...phone, attestation: issuers.attest(ACTOR, phone.deviceId, phone.rootKey.publicKey, "2020-01-01T00:00:00Z") }
        const { stood } = heard(laptop)

        const verdict = await review(laptop, [laptopRow, listedDevice(lapsed, [approvedBy(self, phone)])])

        expect(verdict.unsettled).toEqual([{ deviceId: phone.deviceId, rootKey: phone.rootKey.publicKey }])
        expect(ownLeafStanding(verdict, { deviceId: phone.deviceId, rootKey: phone.rootKey.publicKey })).toBe("unsettled")
        expect(stood).toEqual([])
    })

    it("warns of a generation set by a device it never found approved, not of one it did", async () => {
        const { idp, laptop, self, laptopRow } = await account()
        const phone = testDevice(issuers, ACTOR)
        const tablet = testDevice(issuers, ACTOR)
        const devices = [laptopRow, listedDevice(phone, [approvedBy(self, phone)]), listedDevice(tablet)]
        await review(laptop, devices)
        const { stood } = heard(laptop)
        const generation = (n: number, setByDevice: string) =>
            (idp.key = { generation: n, salt: root(n), checkValue: root(n), approvalPublicKey: root(n), setByDevice })

        generation(2, phone.deviceId)
        const byPhone = await review(laptop, devices)
        generation(3, tablet.deviceId)
        await review(laptop, devices)

        const resets = (events: TrustEvent[]) => events.filter((event) => event.kind === "reset-by-unapproved")
        expect(byPhone.acting).toBe(false)
        expect(resets(stood)).toEqual([{ kind: "reset-by-unapproved", generation: 3, setByDevice: tablet.deviceId }])
        // Still holding generation 1 after a reload, it warns again.
        const reloaded = historyDevice(idp, "laptop", laptop.storage, issuers.jwks)
        await review(reloaded, devices)
        expect(resets(reloaded.e2ee.trustSnapshot())).toEqual(resets(stood))
    })

    it("warns of a generation the instance says this very device set, when it set none", async () => {
        const { idp, laptop, laptopRow } = await account()
        idp.key = { generation: 2, salt: root(2), checkValue: root(2), approvalPublicKey: root(2), setByDevice: laptop.storage.deviceId }
        const { stood } = heard(laptop)

        await review(laptop, [laptopRow])

        expect(stood).toContainEqual({ kind: "reset-by-unapproved", generation: 2, setByDevice: laptop.storage.deviceId })
    })
})
