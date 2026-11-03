import type { ActorUri, ConversationId, DeviceId } from "./e2ee"

/**
 * An MLS leaf's credential, decoded (`identity-provider/specs/e2ee.md § 3.4`): the device, its
 * root key, the IdP's attestation of that key, and the root key's signature over the leaf's
 * signature key. Keys and signatures as the credential writes them, in standard base64. The bytes
 * are `@pinai/mls/leaf-credential`'s to write and read.
 */
export interface LeafCredential {
    v: 2
    actor_uri: ActorUri
    device_id: DeviceId
    drk_pub: string
    idp_att: { issuer: string; kid: string; expires_at: string; signature: string }
    leaf_binding: string
}

/** What a leaf, or a claimed KeyPackage's, claims: its credential when it is one, and its signature key. */
export interface LeafClaim {
    credential: LeafCredential | null
    signatureKey: Uint8Array
}

/** A leaf of a group's MLS state; `own` is this device's. */
export interface MlsLeaf extends LeafClaim {
    leafIndex: number
    own: boolean
}

/**
 * The check of § 3.4 a leaf failed: not a v2 credential, an attestation by another instance than
 * the actor's, expired, not signed by the issuer's key, or a leaf key its root key didn't bind;
 * `unreachable`, the issuer's keys couldn't be had; `not-claimed-device`, a KeyPackage claimed for
 * one device carrying another's credential.
 */
export type LeafRefusal =
    | "malformed"
    | "issuer-mismatch"
    | "expired"
    | "attestation"
    | "unreachable"
    | "binding"
    | "not-claimed-device"

export type LeafVerdict =
    | { ok: true; actorUri: ActorUri; deviceId: DeviceId; rootKey: Uint8Array }
    | { ok: false; reason: LeafRefusal }

/** A claimed KeyPackage is added only when its leaf verifies as the very device it was claimed for. */
export function admitsClaim(verdict: LeafVerdict, actorUri: string, deviceId: DeviceId): LeafVerdict {
    if (!verdict.ok) return verdict
    if (verdict.actorUri === actorUri && verdict.deviceId === deviceId) return verdict
    return { ok: false, reason: "not-claimed-device" }
}

/**
 * A leaf met in a group — in a Welcome's tree, or brought in or replaced by a commit — that failed
 * its checks. Whom it names is its credential's word, unverified.
 */
export interface UntrustedLeaf {
    conversationId: ConversationId
    leafIndex: number
    signatureKey: Uint8Array
    actorUri: ActorUri | null
    deviceId: DeviceId | null
    reason: LeafRefusal
}

export function untrustedLeaf(conversationId: ConversationId, leaf: MlsLeaf, reason: LeafRefusal): UntrustedLeaf {
    return {
        conversationId,
        leafIndex: leaf.leafIndex,
        signatureKey: leaf.signatureKey,
        actorUri: leaf.credential?.actor_uri ?? null,
        deviceId: leaf.credential?.device_id ?? null,
        reason,
    }
}

/** Whether a leaf carries `wanted` already: a device's own leaf against the credential it would make now. */
export function sameCredential(held: LeafCredential | null, wanted: LeafCredential): boolean {
    return (
        held !== null &&
        held.v === wanted.v &&
        held.actor_uri === wanted.actor_uri &&
        held.device_id === wanted.device_id &&
        held.drk_pub === wanted.drk_pub &&
        held.idp_att.issuer === wanted.idp_att.issuer &&
        held.idp_att.kid === wanted.idp_att.kid &&
        held.idp_att.expires_at === wanted.idp_att.expires_at &&
        held.idp_att.signature === wanted.idp_att.signature &&
        held.leaf_binding === wanted.leaf_binding
    )
}
