/**
 * How a device's leaves say it was approved (`identity-provider/specs/e2ee.md § 3.4`): its words'
 * approval, made again from the words it keeps while they give the key in force, and the approval of
 * the device that approved it in a code handshake, kept as the exchange ends. Real E2EE engines over
 * the relay, the device list and the share routes of `setup/key-shares.ts`; the credential's bytes
 * and its refresh in a group are `leaf-credential.spec.ts` and `e2ee-integration.spec.ts`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { verifyStrict } from "@pinai/crypto/attestation-chain.adapter"
import { approvalBytes } from "@pinai/crypto/canonical-bytes"
import type { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { base64ToBytes, bytesToBase64 } from "@pinai/domain/lib/bytes"
import type { LeafApproval } from "@pinai/domain/models/leaf-trust"
import { acceptHistoryShareUseCase } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { approveByPassphraseUseCase } from "@pinai/domain/usecases/e2ee/approve-by-passphrase.usecase"
import { checkHistoryKeyUseCase } from "@pinai/domain/usecases/e2ee/check-history-key.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"

import { ACTOR, IDP } from "./setup/history-idp"
import { FakeIssuers } from "./setup/issuers"
import { bundleHpke, sharingAccount, type SharingAccount, type SharingDevice } from "./setup/key-shares"

const issuers = new FakeIssuers()
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
const accept = (device: SharingDevice) => acceptHistoryShareUseCase(device.deps)(IDP, device.token, ACTOR)

/** What `device`'s leaves would carry now, over the root key it holds. */
function approvalsOf(device: SharingDevice): Promise<LeafApproval[]> {
    const ownApprovals = (device.e2ee as unknown as { ownApprovals: (...args: unknown[]) => Promise<LeafApproval[]> }).ownApprovals
    return ownApprovals.call(device.e2ee, ACTOR, device.storage.deviceId, device.storage.rootKey.publicKey)
}

/** A words approval under the account's key in force; `expectSigned` checks its signature. */
function wordsApproval(a: SharingAccount): LeafApproval {
    const key = a.idp.key!
    return {
        by: "passphrase",
        generation: key.generation,
        approval_public_key: bytesToBase64(key.approvalPublicKey),
        signature: expect.any(String) as unknown as string,
    }
}

/** The partner's approval of `device`, by the partner's root key. */
function partnerApproval(partner: SharingDevice): LeafApproval {
    return { by: "device", device_id: partner.storage.deviceId, signature: expect.any(String) as unknown as string }
}

/** Every signature verifies over `device`'s `PINAI-DEVICE-APPROVAL-v1` bytes, under the key it names. */
function expectSigned(approvals: LeafApproval[], device: SharingDevice, partners: SharingDevice[] = []): void {
    const bytes = approvalBytes(ACTOR, device.storage.deviceId, device.storage.rootKey.publicKey)
    for (const approval of approvals) {
        const key =
            approval.by === "passphrase"
                ? base64ToBytes(approval.approval_public_key)
                : partners.find((p) => p.storage.deviceId === approval.device_id)!.storage.rootKey.publicKey
        expect(verifyStrict(base64ToBytes(approval.signature), bytes, key)).toBe(true)
    }
}

describe("the words' approval", () => {
    it("is carried by the first device, the one the instance took", async () => {
        const a = await account()

        const approvals = await approvalsOf(a.laptop)

        expect(approvals).toEqual([wordsApproval(a)])
        expectSigned(approvals, a.laptop)
    })

    it("is carried once the words are typed, and nothing before", async () => {
        const a = await account()
        expect(await approvalsOf(a.phone)).toEqual([])

        await restoreHistoryFromPassphraseUseCase(a.phone.deps)({ idpUrl: IDP, accessToken: a.phone.token, actorUri: ACTOR, passphrase: a.words })

        const approvals = await approvalsOf(a.phone)
        expect(approvals).toEqual([wordsApproval(a)])
        expectSigned(approvals, a.phone)
    })

    it("is the new generation's once the device holds it, and dropped by a device whose words it replaced", async () => {
        const a = await account()
        await restoreHistoryFromPassphraseUseCase(a.phone.deps)({ idpUrl: IDP, accessToken: a.phone.token, actorUri: ACTOR, passphrase: a.words })

        const { key } = await a.laptop.e2ee.mintHistoryKey(2)
        await a.idp.setKey(IDP, a.laptop.token, key)
        await a.laptop.e2ee.promotePendingHistoryKey()
        await checkHistoryKeyUseCase(a.laptop.deps)(IDP, a.laptop.token, ACTOR)
        await a.phone.e2ee.checkHistoryKey(IDP, a.phone.token)

        const laptops = await approvalsOf(a.laptop)
        expect(laptops).toEqual([{ ...wordsApproval(a), generation: 2 }])
        expectSigned(laptops, a.laptop)
        expect(await approvalsOf(a.phone)).toEqual([])
    })
})

describe("a code's approval", () => {
    it("is carried by the device asking as the exchange ends, before any words; the device answering keeps none", async () => {
        const a = await account()

        await a.handshake(a.phone, a.laptop, { sharing: false })

        const approvals = await approvalsOf(a.phone)
        expect(approvals).toEqual([partnerApproval(a.laptop)])
        expectSigned(approvals, a.phone, [a.laptop])
        expect(await approvalsOf(a.laptop)).toEqual([wordsApproval(a)])
    })

    it("goes beside the words once they are shared: both are carried", async () => {
        const a = await account()
        await a.handshake(a.phone, a.laptop)
        await a.refresh(a.laptop)

        expect(await accept(a.phone)).toEqual({ kind: "kept", generation: 1 })

        const approvals = await approvalsOf(a.phone)
        expect(approvals).toEqual([wordsApproval(a), partnerApproval(a.laptop)])
        expectSigned(approvals, a.phone, [a.laptop])
    })

    it("approves nothing once the device's root key changed: an approval binds the root key it was made over", async () => {
        const a = await account()
        await a.handshake(a.phone, a.laptop, { sharing: false })
        expect(await approvalsOf(a.phone)).toEqual([partnerApproval(a.laptop)])

        a.phone.storage.rootKey = ed25519.keygen()

        expect(await approvalsOf(a.phone)).toEqual([])
    })

    it("keeps no approval that doesn't verify under the partner's root key from the exchange", async () => {
        const a = await account()
        const partner = { deviceId: a.laptop.storage.deviceId, rootKey: a.laptop.storage.rootKey.publicKey, hpkeKey: a.laptop.storage.hpkeKey.publicKey }

        await a.phone.e2ee.rememberHandshakePartner(partner, { actorUri: ACTOR, signature: new Uint8Array(64) })

        expect(a.phone.storage.trust.partners).toHaveLength(1)
        expect(a.phone.storage.trust.partnerApprovals).toEqual([])
        expect(await approvalsOf(a.phone)).toEqual([])
    })
})

describe("after a start over (§ 6.11)", () => {
    it("the new device carries its words' approval of the new generation; the old one, the new device's approval, then both", async () => {
        const a = await account()
        const tablet = a.laptop
        const fresh = await a.enrolled("new", "Chrome on Linux")
        const { key } = await fresh.e2ee.mintHistoryKey(2)
        await a.idp.setKey(IDP, fresh.token, key)
        await fresh.e2ee.promotePendingHistoryKey()
        await approveByPassphraseUseCase(fresh.deps)(IDP, fresh.token, ACTOR)
        await tablet.e2ee.checkHistoryKey(IDP, tablet.token)

        expect(await approvalsOf(fresh)).toEqual([{ ...wordsApproval(a), generation: 2 }])
        expect(await approvalsOf(tablet)).toEqual([])

        await a.handshake(tablet, fresh)
        expect(await approvalsOf(tablet)).toEqual([partnerApproval(fresh)])
        await a.refresh(fresh)
        expect(await accept(tablet)).toEqual({ kind: "kept", generation: 2 })

        const approvals = await approvalsOf(tablet)
        expect(approvals).toEqual([{ ...wordsApproval(a), generation: 2 }, partnerApproval(fresh)])
        expectSigned(approvals, tablet, [fresh])
    })
})
