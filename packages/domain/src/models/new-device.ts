import { inTimeOrder, type DmConversationSummary } from "./dm"
import type { ActorUri, ConversationId, DeviceId } from "./e2ee"
import { personName } from "./identity"
import type { LeafApproval, LeafCredential } from "./leaf-trust"

/**
 * Whether a member refuses an external commit — a device committing itself in — for the leaves it
 * removes, which RFC 9420 § 12.4.3.2 leaves to the application: only leaves of the joiner's own
 * account may go (openmls removes one carrying the joiner's own key). A joiner or a removed leaf
 * naming no account names another.
 */
export function refusesExternalCommit(joiner: LeafCredential | null, removed: readonly (LeafCredential | null)[]): boolean {
    return removed.some((leaf) => joiner === null || leaf?.actor_uri !== joiner.actor_uri)
}

/**
 * Whether `signature` is `signerKey`'s over `subject`'s `PINAI-DEVICE-APPROVAL-v1` bytes — its
 * actor, device id and `drk_pub` —, both in standard base64 as credentials carry them:
 * `@pinai/crypto`'s Ed25519 check.
 */
export type ApprovalCheck = (signature: string, subject: LeafCredential, signerKey: string) => boolean

/** A leaf of a group's tree, as the proof reads it. */
export interface TreeLeaf {
    leafIndex: number
    credential: LeafCredential | null
}

/**
 * Whether the device an external commit brought in shows its account approved it, by what the
 * conversation holds already (`identity-provider/specs/e2ee.md § 3.4`). `tree` is the group as the
 * commit left it; only the leaves of the newcomer's account there, its own left out, can prove it:
 * - by the words: a words approval of the newcomer's, verifying over its bytes, under the key
 *   another of those leaves carries in a words approval of its own, verifying over that leaf's
 *   bytes — at the newest generation those leaves carry: words a later generation replaced prove
 *   nothing, whoever holds them;
 * - by a code: an approval by another device of the account with a leaf there, verifying under
 *   that leaf's root key — never a key the newcomer's own credential carries.
 *
 * Every signature is checked here: credentials are decoded leniently.
 */
export function newcomerProven(
    newcomer: TreeLeaf & { credential: LeafCredential },
    tree: readonly TreeLeaf[],
    approves: ApprovalCheck,
): boolean {
    const subject = newcomer.credential
    const others = tree.flatMap((leaf) =>
        leaf.leafIndex !== newcomer.leafIndex && leaf.credential?.actor_uri === subject.actor_uri ? [leaf.credential] : [],
    )
    const own = subject.approvals ?? []
    return provenByWords(subject, own, others, approves) || provenByCode(subject, own, others, approves)
}

type WordsApproval = Extract<LeafApproval, { by: "passphrase" }>

function provenByWords(subject: LeafCredential, own: readonly LeafApproval[], others: readonly LeafCredential[], approves: ApprovalCheck): boolean {
    const held = others.flatMap((leaf) =>
        (leaf.approvals ?? []).filter(
            (a): a is WordsApproval => a.by === "passphrase" && approves(a.signature, leaf, a.approval_public_key),
        ),
    )
    if (held.length === 0) return false
    const newest = Math.max(...held.map((a) => a.generation))
    const keys = new Set(held.filter((a) => a.generation === newest).map((a) => a.approval_public_key))
    return own.some(
        (a) =>
            a.by === "passphrase" &&
            a.generation === newest &&
            keys.has(a.approval_public_key) &&
            approves(a.signature, subject, a.approval_public_key),
    )
}

function provenByCode(subject: LeafCredential, own: readonly LeafApproval[], others: readonly LeafCredential[], approves: ApprovalCheck): boolean {
    return own.some(
        (a) =>
            a.by === "device" &&
            a.device_id !== subject.device_id &&
            others.some(
                (leaf) => leaf.device_id === a.device_id && leaf.drk_pub !== subject.drk_pub && approves(a.signature, subject, leaf.drk_pub),
            ),
    )
}

/** A device of another account a member saw join a conversation by itself, unproven: what the line tells. */
export interface NewDeviceSeen {
    conversationId: ConversationId
    /** The epoch its commit opened. */
    epoch: number
    actorUri: ActorUri
    deviceId: DeviceId
    /** The commit's, as the Delivery Service stored it. ISO 8601. */
    createdAt: string
}

/**
 * The line it leaves in the conversation's timeline: this device's own entry, kept with the cached
 * messages, never archived.
 */
export interface NewDeviceLine {
    id: string
    actorUri: string
    /** As the conversation named them; `null`: their handle stands in. */
    displayName: string | null
    /** The commit's. ISO 8601. */
    createdAt: string
}

/** One per commit: the same commit applied again, or met again after a reload, is the same line. */
export function newDeviceLine(seen: NewDeviceSeen, displayName: string | null): NewDeviceLine {
    return {
        id: `new-device:${seen.epoch}:${seen.deviceId}`,
        actorUri: seen.actorUri,
        displayName,
        createdAt: seen.createdAt,
    }
}

/** `line` among a conversation's lines, in time order; the same list when it is there already. */
export function withNewDeviceLine(lines: readonly NewDeviceLine[], line: NewDeviceLine): readonly NewDeviceLine[] {
    if (lines.some((held) => held.id === line.id)) return lines
    return inTimeOrder([...lines, line])
}

/** What the conversation list calls `actorUri`: a member of that conversation first, then of any; `null` for none. */
export function memberName(conversations: readonly DmConversationSummary[], conversationId: string, actorUri: string): string | null {
    const theirs = [...conversations.filter((c) => c.conversation_id === conversationId), ...conversations]
    for (const conversation of theirs) {
        const member = conversation.members.find((m) => m.actorUri === actorUri)
        if (member) return member.displayName
    }
    return null
}

/** A conversation's lines as the cache holds them: an entry of another shape is passed over, never thrown on. */
export function readNewDeviceLines(held: unknown): NewDeviceLine[] {
    return Array.isArray(held) ? held.filter(isNewDeviceLine) : []
}

function isNewDeviceLine(value: unknown): value is NewDeviceLine {
    if (typeof value !== "object" || value === null) return false
    const line = value as Record<string, unknown>
    return (
        typeof line.id === "string" &&
        typeof line.actorUri === "string" &&
        (line.displayName === null || typeof line.displayName === "string") &&
        typeof line.createdAt === "string"
    )
}

/** What the line says of `line`'s person, and what pressing it explains. */
export function describeNewDevice(line: Pick<NewDeviceLine, "actorUri" | "displayName">): { text: string; explanation: string } {
    const name = personName(line.actorUri, line.displayName)
    return {
        text: `⚠ ${name} is now writing from a new device.`,
        explanation:
            `This happens when ${name} gets a new phone or reinstalls Pīna'i without their old devices. ` +
            "If you weren't expecting it, check with them another way — a call, in person: someone else may be using their account.",
    }
}
