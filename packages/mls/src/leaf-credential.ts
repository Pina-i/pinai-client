/**
 * The MLS leaf credential, shared by every engine implementation.
 *
 * These bytes travel: they sit inside the BasicCredential of our leaf in the
 * ratchet tree, and every peer decodes them to learn which device owns which
 * leaf — which is how device revocation finds the leaf to remove. A wasm
 * build and a native build that disagreed here would produce groups whose
 * members cannot identify each other, so this lives outside both of them.
 */

import type { ActorUri, DeviceId } from "@pinai/domain/models/e2ee"

/**
 * MLS leaf credentials embed the user's `actor_uri` AND the leaf's
 * `device_id` so device-revocation can find the right leaf to remove.
 * Both fields go into the BasicCredential bytes as JSON; receivers
 * decode the credential the same way to know who owns each leaf.
 */
export interface LeafCredential {
    actor_uri: ActorUri
    device_id: DeviceId
}

export function encodeLeafCredential(c: LeafCredential): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(c))
}

export function decodeLeafCredential(bytes: Uint8Array): LeafCredential | null {
    try {
        const obj = JSON.parse(new TextDecoder().decode(bytes)) as Partial<LeafCredential>
        if (typeof obj?.actor_uri === "string" && typeof obj?.device_id === "string") {
            return obj as LeafCredential
        }
    } catch {
        /* fall through */
    }
    return null
}
