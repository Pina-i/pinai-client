/**
 * The canonical bytes the protocol's signatures and archive entries are over
 * (`identity-provider/specs/e2ee.md § 7.2`): UTF-8 lines joined by `\n`, keys in padded standard
 * base64, rebuilt from bytes so the text is the one the signer wrote. The IdP's tests hold the
 * same golden vectors as `apps/web/test/canonical-bytes.spec.ts`.
 */

import { bytesToBase64 } from "@pinai/domain/lib/bytes"

const encoder = new TextEncoder()

function lines(...fields: string[]): Uint8Array {
    return encoder.encode(fields.join("\n"))
}

/** What the IdP signs: the device's root key, attested for this account until `expiresAt`. */
export function attestationBytes(
    actorUri: string,
    deviceId: string,
    rootKey: Uint8Array,
    expiresAt: string,
    kid: string,
): Uint8Array {
    return lines("IDP-ATTEST-v1", actorUri, deviceId, bytesToBase64(rootKey), expiresAt, kid)
}

/** What a device's root key signs over its HPKE key. */
export function deviceHpkeKeyBytes(actorUri: string, deviceId: string, hpkePublicKey: Uint8Array): Uint8Array {
    return lines("PINAI-DEVICE-HPKE-v1", actorUri, deviceId, bytesToBase64(hpkePublicKey))
}

/** What a device's root key signs over each of its leaf signature keys: the credential's `leaf_binding`. */
export function leafBindingBytes(actorUri: string, deviceId: string, leafSignatureKey: Uint8Array): Uint8Array {
    return lines("PINAI-LEAF-BINDING-v1", actorUri, deviceId, bytesToBase64(leafSignatureKey))
}

/** What approves a device — another device's root key, or a generation's approval key — over its root key. */
export function approvalBytes(actorUri: string, deviceId: string, rootKey: Uint8Array): Uint8Array {
    return lines("PINAI-DEVICE-APPROVAL-v1", actorUri, deviceId, bytesToBase64(rootKey))
}

/** An archive entry's associated data: the ids it is filed under, written as the IdP writes UUIDs. */
export function archiveEntryAad(conversationId: string, id: string): Uint8Array {
    return lines("PINAI-ARCHIVE-v1", conversationId.toLowerCase(), id.toLowerCase())
}
