/**
 * A key share's bytes (`identity-provider/specs/e2ee.md § 3.11`, § 7.2): the words sealed by HPKE
 * in base mode for the recipient's HPKE key, `info` `pinai/history-key-share/v1`, the
 * `PINAI-HISTORY-SHARE-v1` lines as `aad`; the sender's root key signing the `aad`, `enc` and the
 * ciphertext. Who shares and who is trusted is the domain's and the adapter's.
 */

import { ed25519 } from "@noble/curves/ed25519.js"

import { KEY_SHARE_INFO, shareText, shareWords, type KeyShare, type OutgoingKeyShare } from "@pinai/domain/models/key-share"
import type { IHpkePort } from "@pinai/domain/ports/hpke.port"

import { verifyStrict } from "./attestation-chain.adapter"
import { shareAad, shareSignedBytes } from "./canonical-bytes"

const INFO = new TextEncoder().encode(KEY_SHARE_INFO)

export async function sealKeyShare(input: {
    hpke: IHpkePort
    actorUri: string
    sender: string
    recipient: string
    generation: number
    words: readonly string[]
    recipientHpkeKey: Uint8Array
    senderRootSecret: Uint8Array
}): Promise<OutgoingKeyShare> {
    const aad = shareAad(input.actorUri, input.sender, input.recipient, input.generation)
    const plaintext = new TextEncoder().encode(shareText(input.words))
    const { enc, ciphertext } = await input.hpke.seal(input.recipientHpkeKey, INFO, aad, plaintext).finally(() => plaintext.fill(0))
    const signature = ed25519.sign(shareSignedBytes(aad, enc, ciphertext), input.senderRootSecret)
    return { recipientDeviceId: input.recipient, generation: input.generation, enc, ciphertext, signature }
}

/**
 * Checks 2 and 3 on a share from a partner: signed by one of `senderRootKeys` — the root keys the
 * exchanges gave for that device — over the bytes rebuilt for this device, then opened under its
 * HPKE key to 24 words.
 */
export async function openKeyShare(input: {
    hpke: IHpkePort
    actorUri: string
    recipient: string
    share: KeyShare
    senderRootKeys: readonly Uint8Array[]
    hpkePrivateKey: Uint8Array
}): Promise<{ ok: true; words: string[] } | { ok: false; reason: "signature" | "seal" }> {
    const { share } = input
    const aad = shareAad(input.actorUri, share.senderDeviceId, input.recipient, share.generation)
    const signed = shareSignedBytes(aad, share.enc, share.ciphertext)
    if (!input.senderRootKeys.some((rootKey) => verifyStrict(share.signature, signed, rootKey))) return { ok: false, reason: "signature" }
    let text: string
    try {
        const plaintext = await input.hpke.open(input.hpkePrivateKey, { enc: share.enc, ciphertext: share.ciphertext }, INFO, aad)
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(plaintext)
        } finally {
            plaintext.fill(0)
        }
    } catch {
        return { ok: false, reason: "seal" }
    }
    const words = shareWords(text)
    return words ? { ok: true, words } : { ok: false, reason: "seal" }
}
