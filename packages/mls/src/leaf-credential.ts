/**
 * The MLS leaf credential's bytes, shared by every engine implementation.
 *
 * These bytes travel: they sit inside the BasicCredential of our leaf in the ratchet tree, and
 * every peer decodes them to learn which device owns which leaf and to check that the device's
 * root key, attested by its instance, bound the leaf's key (`identity-provider/specs/e2ee.md
 * § 3.4`). A wasm build and a native build that disagreed here would produce groups whose members
 * cannot identify each other, so this lives outside both of them.
 */

import type { LeafCredential } from "@pinai/domain/models/leaf-trust"

export type { LeafCredential }

/** UTF-8 JSON, its fields always in the order of § 3.4, whatever order they came in. */
export function encodeLeafCredential(c: LeafCredential): Uint8Array {
    const ordered: LeafCredential = {
        v: 2,
        actor_uri: c.actor_uri,
        device_id: c.device_id,
        drk_pub: c.drk_pub,
        idp_att: {
            issuer: c.idp_att.issuer,
            kid: c.idp_att.kid,
            expires_at: c.idp_att.expires_at,
            signature: c.idp_att.signature,
        },
        leaf_binding: c.leaf_binding,
    }
    return new TextEncoder().encode(JSON.stringify(ordered))
}

/** A v2 credential, or null for anything else. */
export function decodeLeafCredential(bytes: Uint8Array): LeafCredential | null {
    let obj: unknown
    try {
        obj = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    } catch {
        return null
    }
    if (!isRecord(obj) || obj.v !== 2 || !isRecord(obj.idp_att)) return null
    const att = obj.idp_att
    const strings = [obj.actor_uri, obj.device_id, obj.drk_pub, obj.leaf_binding, att.issuer, att.kid, att.expires_at, att.signature]
    if (!strings.every((s) => typeof s === "string")) return null
    return {
        v: 2,
        actor_uri: obj.actor_uri as LeafCredential["actor_uri"],
        device_id: obj.device_id as string,
        drk_pub: obj.drk_pub as string,
        idp_att: {
            issuer: att.issuer as string,
            kid: att.kid as string,
            expires_at: att.expires_at as string,
            signature: att.signature as string,
        },
        leaf_binding: obj.leaf_binding as string,
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}
