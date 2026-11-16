/**
 * What a conversation's members make of a device that committed itself in
 * (`identity-provider/specs/e2ee.md § 3.4`, § 6.14): the leaves it may remove, whether what the
 * conversation holds proves its account approved it, and the line it leaves otherwise.
 */
import { describe, expect, it } from "vitest"

import type { DmConversationSummary } from "@pinai/domain/models/dm"
import { asActorUri } from "@pinai/domain/models/identity"
import type { LeafApproval, LeafCredential } from "@pinai/domain/models/leaf-trust"
import {
    describeNewDevice,
    memberName,
    newDeviceLine,
    newcomerProven,
    readNewDeviceLines,
    refusesExternalCommit,
    withNewDeviceLine,
    type ApprovalCheck,
    type NewDeviceSeen,
    type TreeLeaf,
} from "@pinai/domain/models/new-device"

const ALICE = asActorUri("https://idp.alice.test/users/alice_k2m9x")
const BOB = asActorUri("https://idp.bob.test/users/bob_p4q8r")

function credential(actor: string, device: string, approvals: LeafApproval[] = []): LeafCredential {
    return {
        v: 2,
        actor_uri: asActorUri(actor),
        device_id: device,
        drk_pub: `root-of-${device}`,
        idp_att: { issuer: new URL(actor).origin, kid: "k", expires_at: "2027-05-14T12:00:00Z", signature: "att" },
        leaf_binding: "binding",
        ...(approvals.length > 0 ? { approvals } : {}),
    }
}

// A stand-in for Ed25519 over the approval bytes: the signer's key, then whom it approves.
const signed = (signerKey: string, subject: LeafCredential) =>
    `${signerKey}>${subject.actor_uri}|${subject.device_id}|${subject.drk_pub}`
const approves: ApprovalCheck = (signature, subject, signerKey) => signature === signed(signerKey, subject)

/** A words approval of `device`'s, signed by the generation's key unless `signature` says otherwise. */
function words(generation: number, key: string, actor: string, device: string, signature?: string): LeafApproval {
    const subject = credential(actor, device)
    return { by: "passphrase", generation, approval_public_key: key, signature: signature ?? signed(key, subject) }
}

/** A code approval of `device` by `approver`'s root key, unless `signerKey` says otherwise. */
function code(approver: string, actor: string, device: string, signerKey = `root-of-${approver}`): LeafApproval {
    return { by: "device", device_id: approver, signature: signed(signerKey, credential(actor, device)) }
}

const leaf = (leafIndex: number, cred: LeafCredential | null): TreeLeaf => ({ leafIndex, credential: cred })

/** Bob's DM with Alice: her lost phone (holding generation 1's words, `K1`) and Bob's laptop. */
function dmWithAlicesPhone(phoneApprovals: LeafApproval[] = [words(1, "K1", ALICE, "phone")]) {
    return [leaf(0, credential(ALICE, "phone", phoneApprovals)), leaf(1, credential(BOB, "bob-laptop"))]
}

/** Alice's new laptop, come in at `leafIndex` 2 carrying `approvals`. */
function newcomer(approvals: LeafApproval[], device = "laptop") {
    return { leafIndex: 2, credential: credential(ALICE, device, approvals) }
}

function proven(tree: TreeLeaf[], joiner: { leafIndex: number; credential: LeafCredential }) {
    return newcomerProven(joiner, [...tree, joiner], approves)
}

describe("newcomerProven — by the words", () => {
    it("proves a device carrying the words another of its account's leaves carries", () => {
        expect(proven(dmWithAlicesPhone(), newcomer([words(1, "K1", ALICE, "laptop")]))).toBe(true)
    })

    it("proves nothing under another key, whatever its generation", () => {
        expect(proven(dmWithAlicesPhone(), newcomer([words(1, "K2", ALICE, "laptop")]))).toBe(false)
        expect(proven(dmWithAlicesPhone(), newcomer([words(2, "K2", ALICE, "laptop")]))).toBe(false)
    })

    it("proves nothing at an older generation than the newest the account's leaves carry", () => {
        const tree = [
            ...dmWithAlicesPhone(),
            leaf(3, credential(ALICE, "tablet", [words(2, "K2", ALICE, "tablet")])),
        ]

        expect(proven(tree, newcomer([words(1, "K1", ALICE, "laptop")]))).toBe(false)
        expect(proven(tree, newcomer([words(2, "K2", ALICE, "laptop")]))).toBe(true)
    })

    it("takes the key from a leaf of the newcomer's own account only", () => {
        const tree = [leaf(0, credential(BOB, "bob-laptop", [words(1, "K1", BOB, "bob-laptop")]))]

        expect(proven(tree, newcomer([words(1, "K1", ALICE, "laptop")]))).toBe(false)
    })

    it("takes nothing from the newcomer's own leaf", () => {
        const joiner = newcomer([words(1, "K1", ALICE, "laptop")])

        expect(newcomerProven(joiner, [leaf(1, credential(BOB, "bob-laptop")), joiner], approves)).toBe(false)
    })

    it("takes no key from a leaf whose own approval doesn't verify under it", () => {
        const tree = dmWithAlicesPhone([words(1, "K1", ALICE, "phone", "forged")])

        expect(proven(tree, newcomer([words(1, "K1", ALICE, "laptop")]))).toBe(false)
    })

    it("counts no generation an approval that doesn't verify claims", () => {
        const tree = [
            ...dmWithAlicesPhone(),
            leaf(3, credential(ALICE, "tablet", [words(9, "K9", ALICE, "tablet", "forged")])),
        ]

        expect(proven(tree, newcomer([words(1, "K1", ALICE, "laptop")]))).toBe(true)
    })

    it("proves nothing with the newcomer's own approval not verifying", () => {
        expect(proven(dmWithAlicesPhone(), newcomer([words(1, "K1", ALICE, "laptop", "forged")]))).toBe(false)
        // Verifying over another device's bytes: the phone's own approval, copied.
        expect(proven(dmWithAlicesPhone(), newcomer([words(1, "K1", ALICE, "phone")]))).toBe(false)
    })
})

describe("newcomerProven — by a code", () => {
    it("proves a device approved by a device of its account with a leaf there, under that leaf's root key", () => {
        expect(proven(dmWithAlicesPhone([]), newcomer([code("phone", ALICE, "laptop")]))).toBe(true)
    })

    it("proves nothing from a device with no leaf there", () => {
        expect(proven(dmWithAlicesPhone([]), newcomer([code("tablet", ALICE, "laptop")]))).toBe(false)
    })

    it("proves nothing under another key than that leaf's", () => {
        expect(proven(dmWithAlicesPhone([]), newcomer([code("phone", ALICE, "laptop", "root-of-laptop")]))).toBe(false)
        expect(proven(dmWithAlicesPhone([]), newcomer([code("phone", ALICE, "laptop", "instance-key")]))).toBe(false)
    })

    it("proves nothing from a leaf of another account", () => {
        expect(proven(dmWithAlicesPhone([]), newcomer([code("bob-laptop", ALICE, "laptop")]))).toBe(false)
    })

    it("proves nothing from the newcomer itself, nor from a leaf carrying its root key", () => {
        expect(proven(dmWithAlicesPhone([]), newcomer([code("laptop", ALICE, "laptop")]))).toBe(false)
        const twin = { ...credential(ALICE, "phone"), drk_pub: "root-of-laptop" }
        const tree = [leaf(0, twin), leaf(1, credential(BOB, "bob-laptop"))]
        expect(proven(tree, newcomer([code("phone", ALICE, "laptop", "root-of-laptop")]))).toBe(false)
    })

    it("proves nothing with a signature that doesn't verify", () => {
        const forged: LeafApproval = { by: "device", device_id: "phone", signature: "forged" }

        expect(proven(dmWithAlicesPhone([]), newcomer([forged]))).toBe(false)
    })
})

describe("newcomerProven — nothing", () => {
    it("proves nothing for a device carrying no approval", () => {
        expect(proven(dmWithAlicesPhone(), newcomer([]))).toBe(false)
    })

    it("proves nothing where none of the account's leaves is left", () => {
        expect(proven([leaf(1, credential(BOB, "bob-laptop"))], newcomer([words(1, "K1", ALICE, "laptop")]))).toBe(false)
    })

    it("takes either proof among several approvals", () => {
        const joiner = newcomer([words(1, "K7", ALICE, "laptop"), code("tablet", ALICE, "laptop"), code("phone", ALICE, "laptop")])

        expect(proven(dmWithAlicesPhone(), joiner)).toBe(true)
    })
})

describe("refusesExternalCommit", () => {
    const joiner = credential(ALICE, "laptop")

    it("takes a join removing nothing, or only leaves of its joiner's account", () => {
        expect(refusesExternalCommit(joiner, [])).toBe(false)
        expect(refusesExternalCommit(joiner, [credential(ALICE, "phone")])).toBe(false)
        expect(refusesExternalCommit(null, [])).toBe(false)
    })

    it("refuses one removing a leaf of another account, or naming none", () => {
        expect(refusesExternalCommit(joiner, [credential(BOB, "bob-laptop")])).toBe(true)
        expect(refusesExternalCommit(joiner, [credential(ALICE, "phone"), credential(BOB, "bob-laptop")])).toBe(true)
        expect(refusesExternalCommit(joiner, [null])).toBe(true)
        expect(refusesExternalCommit(null, [credential(ALICE, "phone")])).toBe(true)
    })
})

describe("the new device's line", () => {
    const seen: NewDeviceSeen = {
        conversationId: "c1",
        epoch: 5,
        actorUri: ALICE,
        deviceId: "laptop",
        createdAt: "2026-11-16T10:00:00Z",
    }

    it("says who writes from a new device, and what that may mean", () => {
        expect(describeNewDevice(newDeviceLine(seen, "Alice"))).toEqual({
            text: "⚠ Alice is now writing from a new device.",
            explanation:
                "This happens when Alice gets a new phone or reinstalls Pīna'i without their old devices. " +
                "If you weren't expecting it, check with them another way — a call, in person: someone else may be using their account.",
        })
    })

    it("names them by their handle only when the conversation has no name for them", () => {
        expect(describeNewDevice(newDeviceLine(seen, null)).text).toBe("⚠ alice_k2m9x is now writing from a new device.")
    })

    it("is one line per commit: the same commit met again adds nothing", () => {
        const line = newDeviceLine(seen, "Alice")
        const lines = withNewDeviceLine([], line)

        expect(withNewDeviceLine(lines, newDeviceLine(seen, "Alice A."))).toBe(lines)
        expect(withNewDeviceLine(lines, newDeviceLine({ ...seen, epoch: 9 }, "Alice"))).toHaveLength(2)
    })

    it("keeps a conversation's lines in time order", () => {
        const later = newDeviceLine({ ...seen, epoch: 7, createdAt: "2026-11-16T12:00:00Z" }, "Alice")
        const earlier = newDeviceLine(seen, "Alice")

        expect(withNewDeviceLine([later], earlier)).toEqual([earlier, later])
    })

    it("reads what the cache holds leniently: another shape is passed over, never thrown on", () => {
        const line = newDeviceLine(seen, "Alice")

        expect(readNewDeviceLines([line, { id: 3 }, null, "x"])).toEqual([line])
        expect(readNewDeviceLines({ lines: [line] })).toEqual([])
        expect(readNewDeviceLines(undefined)).toEqual([])
    })

    it("names them as the conversation's members do, else as another conversation does", () => {
        const summary = (id: string, members: [string, string | null][]): DmConversationSummary => ({
            conversation_id: id,
            kind: "group",
            name: null,
            members: members.map(([actorUri, displayName]) => ({ actorUri, displayName, avatarUrl: null })),
            last_message_sender: null,
            unread_count: 0,
            last_message_at: null,
            removed_at: null,
        })
        const list = [summary("c0", [[ALICE, "Alice elsewhere"]]), summary("c1", [[ALICE, "Alice"], [BOB, null]])]

        expect(memberName(list, "c1", ALICE)).toBe("Alice")
        expect(memberName(list, "c9", ALICE)).toBe("Alice elsewhere")
        expect(memberName(list, "c1", BOB)).toBeNull()
        expect(memberName([], "c1", ALICE)).toBeNull()
    })
})
