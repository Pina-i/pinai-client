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

/** What a device's root key signs to name it on the session `sessionId`, the access token's `sid`. */
export function sessionDeviceBytes(actorUri: string, deviceId: string, sessionId: string): Uint8Array {
    return lines("PINAI-SESSION-DEVICE-v1", actorUri, deviceId.toLowerCase(), sessionId.toLowerCase())
}

/** What approves a device — another device's root key, or a generation's approval key — over its root key. */
export function approvalBytes(actorUri: string, deviceId: string, rootKey: Uint8Array): Uint8Array {
    return lines("PINAI-DEVICE-APPROVAL-v1", actorUri, deviceId, bytesToBase64(rootKey))
}

/** A key share's HPKE `aad`: whose passphrase, from which device, to which, under which generation. */
export function shareAad(actorUri: string, senderDeviceId: string, recipientDeviceId: string, generation: number): Uint8Array {
    return lines("PINAI-HISTORY-SHARE-v1", actorUri, senderDeviceId, recipientDeviceId, String(generation))
}

/** What the sender's root key signs: the `aad`'s lines, then the seal's two halves, as `POST /api/history/key-shares` sends them. */
export function shareSignedBytes(aad: Uint8Array, enc: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    const tail = encoder.encode(`\n${bytesToBase64(enc)}\n${bytesToBase64(ciphertext)}`)
    const out = new Uint8Array(aad.length + tail.length)
    out.set(aad)
    out.set(tail, aad.length)
    return out
}

/** An archive entry's associated data: the ids it is filed under, written as the IdP writes UUIDs. */
export function archiveEntryAad(conversationId: string, id: string): Uint8Array {
    return lines("PINAI-ARCHIVE-v1", conversationId.toLowerCase(), id.toLowerCase())
}
