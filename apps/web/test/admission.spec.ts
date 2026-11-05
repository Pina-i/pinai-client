/**
 * When a device is in (`identity-provider/specs/e2ee.md § 3.6`, § 3.9): holding the current
 * passphrase, or approved by one of its handshake partners — listed unrevoked under the root key
 * the exchange gave, at the generation this device's own check stood on, its approval verifying
 * over this device's root key as it is now; or holding words of an older key of the account, over a
 * reset by a device it never found approved, or a change none of its devices made — in, acting on
 * nothing, under a banner. Only a replacement by a device it found approved keeps such a device
 * out. Anything else is out, and a device out publishes no KeyPackage: not on the first device's
 * path, the typed words', the code's, nor the tick's, which refills only at the threshold or for a
 * device the IdP doesn't list. The rule is the
 * domain's, the signatures real, each device the real E2EE engine against an IdP answering as the
 * spec says.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { approvalBytes } from "@pinai/crypto/canonical-bytes"
import {
    decideGateRoute,
    deviceAdmission,
    keptWordsReset,
    withdrawalRechecks,
    needsPartners,
    parseAdmission,
    type CheckedPartner,
    type PartnerFacts,
} from "@pinai/domain/models/admission"
import type { DeviceApproval, DeviceListEntry } from "@pinai/domain/models/device"
import { withTrust, type TrustEvent } from "@pinai/domain/models/device-trust"
import { PENDING_KEY_FRESH_MS, type HistoryKeyStanding } from "@pinai/domain/models/history-key"
import { IdpError } from "@pinai/domain/models/idp-error"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { registerIdentityUseCase } from "@pinai/domain/usecases/e2ee/register-identity.usecase"
import { replenishKeyPackagesUseCase } from "@pinai/domain/usecases/e2ee/replenish-keypackages.usecase"
import { HistoryRestore } from "@pinai/domain/usecases/e2ee/restore-due-history.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"

import { ACTOR, FakeHistoryIdp, IDP, MemoryHistoryStorage, historyDevice, publishingDevice } from "./setup/history-idp"

afterEach(() => {
    vi.restoreAllMocks()
})

const root = (n: number) => new Uint8Array(32).fill(n)
const key = (generation: number) => ({ generation, salt: new Uint8Array(16), checkValue: root(3), approvalPublicKey: root(4) })
const NO_WORDS: HistoryKeyStanding = { kind: "no-passphrase", generation: 2 }
const mismatch = (reason: "check-value" | "approval-key" | "rollback" | "relabelled", generation: number, held: number | null) =>
    ({ kind: "mismatch", generation, setByDevice: "laptop", reason, held }) as const

function row(deviceId: string, change: Partial<DeviceListEntry> = {}): DeviceListEntry {
    return {
        device_id: deviceId,
        display_name: "Firefox on Linux",
        kind: "laptop",
        paired_at: "2026-11-01T00:00:00Z",
        last_seen_at: "2026-11-04T00:00:00Z",
        revoked_at: null,
        signed_in: true,
        last_active_at: null,
        drk_public_key: root(1),
        attestation_signature: null,
        attestation_kid: null,
        attestation_expires_at: null,
        hpke_public_key: root(2),
        hpke_key_signature: null,
        history_generation: 2,
        approvals: [],
        ...change,
    }
}

describe("the rule", () => {
    const partner = (change: Partial<CheckedPartner> = {}): CheckedPartner => ({
        deviceId: "laptop",
        rootKey: root(1),
        hpkeKey: root(2),
        approvesThisDevice: true,
        ...change,
    })
    const facts = (change: Partial<PartnerFacts> = {}, laptop: Partial<DeviceListEntry> = {}): PartnerFacts => ({
        devices: [row("laptop", laptop), row("phone", { drk_public_key: root(5), history_generation: null })],
        partners: [partner()],
        revokedSeen: [],
        setter: null,
        ...change,
    })

    it("lets in a device holding the current passphrase, its partners unread", () => {
        expect(deviceAdmission({ kind: "holds", generation: 2, settled: true }, null)).toEqual({ kind: "in", by: "passphrase" })
        expect(deviceAdmission({ kind: "holds", generation: 2, settled: false }, null)).toEqual({ kind: "in", by: "passphrase" })
        expect(needsPartners({ kind: "holds", generation: 2, settled: true })).toBe(false)
    })

    it("lets in a device a partner approved: listed unrevoked under that root key, at the generation it stood on, its approval verifying", () => {
        expect(needsPartners(NO_WORDS)).toBe(true)
        expect(deviceAdmission(NO_WORDS, facts())).toEqual({ kind: "in", by: "partner", partner: "laptop" })
    })

    it("needs every condition", () => {
        const out = { kind: "out" }
        expect(deviceAdmission(NO_WORDS, facts({ devices: [row("phone")] }))).toEqual(out)
        expect(deviceAdmission(NO_WORDS, facts({}, { revoked_at: "2026-11-03T00:00:00Z" }))).toEqual(out)
        expect(deviceAdmission(NO_WORDS, facts({ revokedSeen: ["laptop"] }))).toEqual(out)
        expect(deviceAdmission(NO_WORDS, facts({}, { drk_public_key: root(9) }))).toEqual(out)
        expect(deviceAdmission(NO_WORDS, facts({}, { drk_public_key: null }))).toEqual(out)
        expect(deviceAdmission(NO_WORDS, facts({}, { history_generation: 1 }))).toEqual(out)
        expect(deviceAdmission(NO_WORDS, facts({}, { history_generation: null }))).toEqual(out)
        expect(deviceAdmission(NO_WORDS, facts({ partners: [partner({ approvesThisDevice: false })] }))).toEqual(out)
        expect(deviceAdmission(NO_WORDS, facts({ partners: [] }))).toEqual(out)
    })

    it("lets nobody in without a key in force, from a list naming a device twice, or when its partners can't be read", () => {
        expect(needsPartners({ kind: "no-key" })).toBe(false)
        expect(deviceAdmission({ kind: "no-key" }, facts())).toEqual({ kind: "out" })
        const twice = facts()
        expect(deviceAdmission(NO_WORDS, { ...twice, devices: [...twice.devices, row("laptop", { drk_public_key: root(9) })] })).toEqual({
            kind: "out",
        })
        expect(deviceAdmission(NO_WORDS, null)).toEqual({ kind: "out" })
    })

    it("after its words were replaced on a device it found approved: back in only through the new device it approved and was approved by", () => {
        const after = mismatch("check-value", 2, 1)
        const replacedOnLaptop = { setter: { deviceId: "laptop", approved: true, self: false } }
        expect(needsPartners(after)).toBe(true)
        expect(deviceAdmission(after, facts(replacedOnLaptop))).toEqual({ kind: "in", by: "partner", partner: "laptop" })
        expect(deviceAdmission(after, facts({ ...replacedOnLaptop, partners: [] }))).toEqual({ kind: "out" })
    })

    it("keeps in a device that held words of the account over a reset by a device it never found approved, or can't tell", () => {
        const after = mismatch("check-value", 2, 1)
        const kept = { kind: "in", by: "kept-words", cause: "reset-by-unapproved" }
        expect(deviceAdmission(after, facts({ partners: [] }))).toEqual(kept)
        expect(deviceAdmission(after, facts({ partners: [], setter: { deviceId: "laptop", approved: false, self: false } }))).toEqual(kept)
        // Approved, but not the device the key names: the instance's word against this device's.
        expect(deviceAdmission(after, facts({ partners: [], setter: { deviceId: "tablet", approved: true, self: false } }))).toEqual(kept)
        expect(deviceAdmission(after, null)).toEqual(kept)
    })

    it("lets in by its partner, before its kept words, a device the code approved: a share coming late brings no banner back", () => {
        const after = mismatch("check-value", 2, 1)
        const admission = deviceAdmission(after, facts({ setter: { deviceId: "tablet", approved: false, self: false } }))

        expect(admission).toEqual({ kind: "in", by: "partner", partner: "laptop" })
        expect(keptWordsReset(admission, after)).toBeNull()
    })

    it("takes a newer generation said to be its own, while it set none, for a change none of its devices made", () => {
        const named = { ...mismatch("check-value", 2, 1), setByDevice: "phone" }
        const self = { setter: { deviceId: "phone", approved: false, self: true }, partners: [] }

        expect(deviceAdmission(named, facts(self))).toEqual({ kind: "in", by: "kept-words", cause: "unknown-change" })
        expect(keptWordsReset(deviceAdmission(named, facts(self)), named)).toEqual({ cause: "unknown-change", setter: null })
    })

    it("keeps in a device that held words of the account over a change none of its devices made, no partner deciding it", () => {
        for (const caught of [mismatch("rollback", 1, 2), mismatch("relabelled", 2, 1), mismatch("approval-key", 2, 2), mismatch("check-value", 2, 2)]) {
            expect(needsPartners(caught)).toBe(false)
            expect(deviceAdmission(caught, facts({}, { history_generation: caught.generation }))).toEqual({
                kind: "in",
                by: "kept-words",
                cause: "unknown-change",
            })
            expect(deviceAdmission(caught, null)).toMatchObject({ by: "kept-words" })
        }
    })

    it("lets in no device that never held words of the account, whatever changed", () => {
        expect(deviceAdmission(mismatch("rollback", 0, null), facts())).toEqual({ kind: "out" })
        expect(deviceAdmission(NO_WORDS, facts({ partners: [] }))).toEqual({ kind: "out" })
    })

    it("sends each to its page: kept words to the app under a banner, a replacement to the reset page, a new device to its own", () => {
        const route = (standing: HistoryKeyStanding, partnerFacts: PartnerFacts | null) => {
            const admission = deviceAdmission(standing, partnerFacts)
            return [decideGateRoute({ pending: false, standing, admission }), keptWordsReset(admission, standing)]
        }
        const replaced = facts({ partners: [], setter: { deviceId: "laptop", approved: true, self: false } })

        expect(route(mismatch("check-value", 2, 1), facts({ partners: [] }))).toEqual(["app", { cause: "reset-by-unapproved", setter: "laptop" }])
        expect(route(mismatch("approval-key", 2, 2), null)).toEqual(["app", { cause: "unknown-change", setter: null }])
        expect(route(mismatch("check-value", 2, 1), replaced)).toEqual(["reset", null])
        expect(route(NO_WORDS, facts({ partners: [] }))).toEqual(["new-device", null])
        expect(route({ kind: "holds", generation: 2, settled: true }, null)).toEqual(["app", null])
    })

    it("reads back what it recorded, the kept words' cause included", () => {
        expect(parseAdmission({ kind: "in", by: "kept-words", cause: "unknown-change" })).toEqual({ kind: "in", by: "kept-words", cause: "unknown-change" })
        expect(parseAdmission({ kind: "in", by: "kept-words", cause: "other" })).toBeNull()
        expect(parseAdmission({ kind: "in", by: "kept-words" })).toBeNull()
    })

    it("checks again when a warning is withdrawn, unless a pending key written moments ago waits: its own new generation", () => {
        const withdrawn: TrustEvent = { kind: "reset-by-unapproved", generation: 2, setByDevice: "tablet" }
        const pending = (mintedAt: number | null) => ({ ...key(3), mintedAt })
        const now = 1_000_000

        expect(withdrawalRechecks(withdrawn, null, now)).toBe(true)
        expect(withdrawalRechecks(withdrawn, pending(now - 1_000), now)).toBe(false)
        // A start over that failed leaves it: it holds the check back no longer than the fresh window.
        expect(withdrawalRechecks(withdrawn, pending(now - PENDING_KEY_FRESH_MS), now)).toBe(true)
        expect(withdrawalRechecks(withdrawn, pending(null), now)).toBe(true)
        expect(withdrawalRechecks({ kind: "device-list-refused", duplicates: [] }, null, now)).toBe(false)
    })
})

type Device = ReturnType<typeof historyDevice>

/** An account whose laptop holds generation 1, and a phone the laptop approved in a code handshake. */
async function account(phoneOf: (idp: FakeHistoryIdp) => Device | Promise<Device> = (idp) => historyDevice(idp, "phone")) {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop")
    const founded = await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    if (founded.kind !== "holds") throw new Error("the first device didn't set the key")
    const phone = await phoneOf(idp)
    await idp.session().linkDevice(IDP, phone.token, phone.storage.deviceId)
    await phone.e2ee.rememberHandshakePartner({
        deviceId: laptop.storage.deviceId,
        rootKey: laptop.storage.rootKey.publicKey,
        hpkeKey: laptop.storage.hpkeKey.publicKey,
    })
    return { idp, laptop, phone, words: founded.words }
}

/** `secretKey` approving `device` over `rootKey` — its root key now unless said. */
function approval(by: string, secretKey: Uint8Array, device: Device, rootKey = device.storage.rootKey.publicKey): DeviceApproval {
    const signature = ed25519.sign(approvalBytes(ACTOR, device.storage.deviceId, rootKey), secretKey)
    return { by: "device", device_id: by, signature, created_at: "2026-11-04T00:00:00Z" }
}

/** The list as the instance serves it: the laptop holding `generation`, the phone carrying `approvals`. */
function listing(laptop: Device, phone: Device, approvals: DeviceApproval[], laptopRow: Partial<DeviceListEntry> = {}, generation = 1) {
    return [
        row(laptop.storage.deviceId, { drk_public_key: laptop.storage.rootKey.publicKey, history_generation: generation, ...laptopRow }),
        row(phone.storage.deviceId, { drk_public_key: phone.storage.rootKey.publicKey, history_generation: null, approvals }),
    ]
}

/** `device`'s deps, the device list being `devices`. */
function seeing(device: Device, devices: () => DeviceListEntry[]) {
    return { ...device.deps, deviceDirectoryPort: { ...device.deps.deviceDirectoryPort, listDevices: async () => ({ devices: devices() }) } }
}

const admit = (device: Device, devices: DeviceListEntry[]) =>
    checkAdmissionUseCase(seeing(device, () => devices))(IDP, device.token, ACTOR).then((checked) => checked.admission)

const laptopApproves = (laptop: Device, phone: Device) => approval(laptop.storage.deviceId, laptop.storage.rootKey.secretKey, phone)

async function startOverElsewhere(idp: FakeHistoryIdp) {
    const other = historyDevice(idp, "elsewhere")
    await idp.session().linkDevice(IDP, other.token, other.storage.deviceId)
    await idp.setKey(IDP, other.token, (await other.e2ee.mintHistoryKey((idp.key?.generation ?? 0) + 1)).key)
}

describe("a partner's approval, with real keys", () => {
    it("lets in a device its partner approved over its root key as it is now, under the root key the exchange gave", async () => {
        const { idp, laptop, phone } = await account()
        idp.log.length = 0

        expect(await admit(phone, listing(laptop, phone, [laptopApproves(laptop, phone)]))).toEqual({
            kind: "in",
            by: "partner",
            partner: laptop.storage.deviceId,
        })
        expect(idp.log.filter((line) => line === "read key")).toHaveLength(1)
        expect(phone.storage.admission).toEqual({ kind: "in", by: "partner", partner: laptop.storage.deviceId })
    })

    it("keeps out a device whose partner holds an older generation: a start over elsewhere", async () => {
        const { idp, laptop, phone } = await account()
        await startOverElsewhere(idp)
        const approved = [laptopApproves(laptop, phone)]

        expect(await admit(phone, listing(laptop, phone, approved, {}, 1))).toEqual({ kind: "out" })
        expect(await admit(phone, listing(laptop, phone, approved, {}, 2))).toMatchObject({ kind: "in", by: "partner" })
    })

    it("keeps out a device approved over a root key it had before", async () => {
        const { laptop, phone } = await account()
        const before = phone.storage.rootKey.publicKey
        phone.storage.rootKey = ed25519.keygen()

        const overOld = approval(laptop.storage.deviceId, laptop.storage.rootKey.secretKey, phone, before)
        expect(await admit(phone, listing(laptop, phone, [overOld]))).toEqual({ kind: "out" })
    })

    it("keeps out a device whose partner's approval a list-swapped root key signed", async () => {
        const { laptop, phone } = await account()
        const swapped = ed25519.keygen()
        const bySwapped = approval(laptop.storage.deviceId, swapped.secretKey, phone)

        expect(await admit(phone, listing(laptop, phone, [bySwapped], { drk_public_key: swapped.publicKey }))).toEqual({ kind: "out" })
        expect(await admit(phone, listing(laptop, phone, [bySwapped]))).toEqual({ kind: "out" })
    })

    it("counts no approval by a device that isn't its partner, nor its partner's when revoked — and keeps that revocation", async () => {
        const { idp, laptop, phone } = await account()
        const tablet = historyDevice(idp, "tablet")
        const byTablet = approval(laptop.storage.deviceId, tablet.storage.rootKey.secretKey, phone)
        expect(await admit(phone, listing(laptop, phone, [byTablet]))).toEqual({ kind: "out" })

        const revoked = listing(laptop, phone, [laptopApproves(laptop, phone)], { revoked_at: "2026-11-04T00:00:00Z" })
        expect(await admit(phone, revoked)).toEqual({ kind: "out" })
        expect(phone.storage.trust.revoked).toEqual([laptop.storage.deviceId])
        // Listed unrevoked again, it stays revoked here.
        expect(await admit(phone, listing(laptop, phone, [laptopApproves(laptop, phone)]))).toEqual({ kind: "out" })
    })

    it("keeps out a device that caught a rollback, its partner listed at the generation gone back to", async () => {
        const { idp, laptop, phone } = await account()
        const gen1 = idp.key!
        await startOverElsewhere(idp)
        expect(await admit(phone, listing(laptop, phone, [laptopApproves(laptop, phone)], {}, 2))).toMatchObject({ kind: "in" })

        idp.key = gen1
        expect(await admit(phone, listing(laptop, phone, [laptopApproves(laptop, phone)], {}, 1))).toEqual({ kind: "out" })
        expect(await phone.e2ee.historyKeyStanding()).toMatchObject({ kind: "mismatch", reason: "rollback" })
    })

    it("keeps in, acting on nothing, a device holding the words under an approval key the instance swapped, whatever its partner", async () => {
        const { idp, laptop, phone, words } = await account()
        await restoreHistoryFromPassphraseUseCase(phone.deps)({ idpUrl: IDP, accessToken: phone.token, actorUri: ACTOR, passphrase: words })
        idp.key = { ...idp.key!, approvalPublicKey: ed25519.keygen().publicKey }

        expect(await admit(phone, listing(laptop, phone, [laptopApproves(laptop, phone)], {}, 1))).toEqual({
            kind: "in",
            by: "kept-words",
            cause: "unknown-change",
        })
        expect(await phone.e2ee.historyKeyStanding()).toMatchObject({ kind: "mismatch", reason: "approval-key" })
    })

    it("tells a reset by a device it found approved over the root key listed now from any other, reading the list once", async () => {
        const { idp, laptop } = await account()
        await startOverElsewhere(idp)
        const setter = idp.key!.setByDevice!
        const rootKey = idp.rootKeys.get(setter)!
        const listed = [row(setter, { drk_public_key: rootKey, history_generation: 2 })]
        idp.log.length = 0

        expect(await admit(laptop, listed)).toEqual({ kind: "in", by: "kept-words", cause: "reset-by-unapproved" })
        expect(idp.log.filter((line) => line === "read key")).toHaveLength(1)
        laptop.storage.trust = withTrust(laptop.storage.trust, { approved: [{ deviceId: setter, rootKey }] })
        expect(await admit(laptop, listed)).toEqual({ kind: "out" })
        expect(await admit(laptop, [row(setter, { drk_public_key: root(9), history_generation: 2 })])).toMatchObject({ by: "kept-words" })
    })
})

describe("KeyPackages, only once in", () => {
    const keyPackages = (idp: FakeHistoryIdp) => idp.log.filter((line) => line === "key packages").length
    const uploads = (idp: FakeHistoryIdp) => idp.log.filter((line) => line.startsWith("upload"))
    const input = (device: Device) => ({ idpUrl: IDP, accessToken: device.token, actorUri: ACTOR })

    it("publishes none for a device that is out: registerIdentityUseCase refuses it", async () => {
        const { idp, phone } = await account()
        idp.log.length = 0

        expect(await registerIdentityUseCase(phone.deps)(input(phone))).toEqual({ kind: "out" })
        expect(keyPackages(idp)).toBe(0)
        expect(phone.e2ee.register).not.toHaveBeenCalled()
    })

    it("publishes none for a device whose typed words are wrong, nor for a founding that finds another device's key", async () => {
        const { idp, phone } = await account()
        idp.log.length = 0
        const wrong = [...(await account()).words]

        const typed = await restoreHistoryFromPassphraseUseCase(phone.deps)({ ...input(phone), passphrase: wrong })
        expect(typed).toEqual({ kind: "wrong-passphrase" })
        expect(await bootstrapFirstDeviceUseCase(phone.deps)(input(phone))).toEqual({ kind: "has-key" })
        expect(keyPackages(idp)).toBe(0)
    })

    it("on the first device, right after its self-approval, its stash filled to the cap", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = await publishingDevice(idp, "laptop")

        await bootstrapFirstDeviceUseCase(laptop.deps)(input(laptop))

        expect(idp.log.slice(idp.log.indexOf("approve by passphrase 1"))).toEqual([
            "approve by passphrase 1",
            "report 1",
            "save words 1 approved",
            "register device",
            `upload ${idp.keyPackages.cap}`,
        ])
    })

    it("on typed words, right after the approval, before the restore", async () => {
        const { idp, words } = await account()
        const phone = await publishingDevice(idp, "typing")
        idp.log.length = 0

        await restoreHistoryFromPassphraseUseCase(phone.deps)({ ...input(phone), passphrase: words })
        await new HistoryRestore({ e2ee: phone.e2ee }).run({ idpUrl: IDP, accessToken: () => phone.token }, vi.fn())

        expect(idp.log.slice(idp.log.indexOf("approve by passphrase 1"))).toEqual([
            "approve by passphrase 1",
            "report 1",
            "save words 1 approved",
            "register device",
            `upload ${idp.keyPackages.cap}`,
            "read archive",
        ])
    })

    it("on a code, once the list shows its partner's approval", async () => {
        const { idp, laptop, phone } = await account((idp) => publishingDevice(idp, "phone"))
        let approvals: DeviceApproval[] = []
        const deps = seeing(phone, () => listing(laptop, phone, approvals))
        idp.log.length = 0

        expect(await registerIdentityUseCase(deps)(input(phone))).toEqual({ kind: "out" })
        expect(uploads(idp)).toEqual([])
        approvals = [laptopApproves(laptop, phone)]
        expect(await registerIdentityUseCase(deps)(input(phone))).toMatchObject({ kind: "in", by: "partner" })
        expect(uploads(idp)).toEqual([`upload ${idp.keyPackages.cap}`])
    })

    it("the tick refills a device in even when its renewal fails, and says why, so `device_mismatch` reaches the sign-in again", async () => {
        const { idp, laptop, phone } = await account((idp) => publishingDevice(idp, "phone"))
        const deps = seeing(phone, () => listing(laptop, phone, [laptopApproves(laptop, phone)]))
        const mismatched = new IdpError(403, "device_mismatch", "This session signed in another device")
        vi.mocked(phone.e2ee.registerDevice).mockRejectedValue(mismatched)
        idp.log.length = 0

        const ticked = await replenishKeyPackagesUseCase(deps)(input(phone))

        expect(ticked).toMatchObject({ admission: { kind: "in", by: "partner" }, renewalFailure: mismatched })
        expect(ticked.status?.devices).toEqual([{ device_id: phone.storage.deviceId, available: idp.keyPackages.cap, needs_refill: false }])
        expect(uploads(idp)).toEqual([`upload ${idp.keyPackages.cap}`])
        expect(phone.storage.boundActorUri).toBe(ACTOR)
    })

    it("mints nothing above the threshold, on a reload or a publish, and refills to the cap at it", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = await publishingDevice(idp, "laptop")
        await bootstrapFirstDeviceUseCase(laptop.deps)(input(laptop))
        idp.keyPackages.take(laptop.storage.deviceId, 3)
        idp.log.length = 0

        const reloaded = await publishingDevice(idp, "laptop", laptop.storage)
        await replenishKeyPackagesUseCase(reloaded.deps)(input(reloaded))
        await registerIdentityUseCase(reloaded.deps)(input(reloaded))
        expect(uploads(idp)).toEqual([])

        idp.keyPackages.take(laptop.storage.deviceId, idp.keyPackages.cap - 3 - idp.keyPackages.threshold)
        await replenishKeyPackagesUseCase(reloaded.deps)(input(reloaded))
        expect(uploads(idp)).toEqual([`upload ${idp.keyPackages.cap - idp.keyPackages.threshold}`])
    })

    it("the tick refills a device kept in by its words over a reset it didn't make, and stops once one it found approved replaced them", async () => {
        const idp = new FakeHistoryIdp()
        const laptop = await publishingDevice(idp, "laptop", new MemoryHistoryStorage())
        await bootstrapFirstDeviceUseCase(laptop.deps)(input(laptop))
        idp.keyPackages.take(laptop.storage.deviceId, idp.keyPackages.cap)
        await startOverElsewhere(idp)
        const setter = idp.key!.setByDevice!
        const rootKey = idp.rootKeys.get(setter)!
        const deps = seeing(laptop, () => [row(setter, { drk_public_key: rootKey, history_generation: 2 })])
        idp.log.length = 0

        expect(await replenishKeyPackagesUseCase(deps)(input(laptop))).toMatchObject({ admission: { kind: "in", by: "kept-words" } })
        expect(uploads(idp)).toHaveLength(1)

        idp.keyPackages.take(laptop.storage.deviceId, idp.keyPackages.cap)
        laptop.storage.trust = withTrust(laptop.storage.trust, { approved: [{ deviceId: setter, rootKey }] })
        idp.log.length = 0
        expect(await replenishKeyPackagesUseCase(deps)(input(laptop))).toEqual({ admission: { kind: "out" }, status: null })
        expect(uploads(idp)).toEqual([])
    })
})
