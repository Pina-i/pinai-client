import { HTTPError } from "ky"
import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"

import { bytesToBase64, decodeBase64 } from "@pinai/domain/lib/bytes"
import { canonicalId } from "@pinai/domain/models/approval-handshake"
import { isGeneration } from "@pinai/domain/models/history-key"
import {
    SHARE_CIPHERTEXT_MAX_BYTES,
    SHARE_ENC_BYTES,
    SHARE_SIGNATURE_BYTES,
    type KeyShare,
    type OutgoingKeyShare,
} from "@pinai/domain/models/key-share"
import type { IKeySharePort } from "@pinai/domain/ports/key-share.port"

import { isRow } from "../device-directory/device-directory-api.adapter"

/** `/api/history/key-shares`: opaque bytes as standard base64 both ways; every refusal an `IdpError`. */
export class KeyShareApiAdapter implements IKeySharePort {
    async share(idpUrl: string, accessToken: string, share: OutgoingKeyShare): Promise<void> {
        try {
            await idp.post(sharesUrl(idpUrl), {
                headers: auth(accessToken),
                json: {
                    recipient_device_id: share.recipientDeviceId,
                    generation: share.generation,
                    enc: bytesToBase64(share.enc),
                    ciphertext: bytesToBase64(share.ciphertext),
                    signature: bytesToBase64(share.signature),
                },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Sharing the history passphrase failed")
        }
    }

    async waiting(idpUrl: string, accessToken: string): Promise<KeyShare | null> {
        let body: unknown
        try {
            body = await idp.get(sharesUrl(idpUrl), { headers: auth(accessToken) }).json<unknown>()
        } catch (error) {
            if (error instanceof HTTPError && error.response.status === 404) return null
            throw await idpErrorFrom(error, "Reading the history key share failed")
        }
        const share = parseKeyShare(body)
        if (!share) throw new Error("The IdP answered a key share that isn't one")
        return share
    }
}

/** `GET /api/history/key-shares`' answer, or `null` when a field isn't what it must be. */
export function parseKeyShare(body: unknown): KeyShare | null {
    if (!isRow(body)) return null
    const senderDeviceId = canonicalId(body.sender_device_id)
    const enc = decodeBase64(body.enc, SHARE_ENC_BYTES)
    const ciphertext = decodeBase64(body.ciphertext)
    const signature = decodeBase64(body.signature, SHARE_SIGNATURE_BYTES)
    if (!senderDeviceId || !isGeneration(body.generation) || !enc || !signature || typeof body.created_at !== "string") return null
    if (!ciphertext || ciphertext.length === 0 || ciphertext.length > SHARE_CIPHERTEXT_MAX_BYTES) return null
    return { senderDeviceId, generation: body.generation, enc, ciphertext, signature, createdAt: body.created_at }
}

function sharesUrl(idpUrl: string): string {
    return `${idpUrl.replace(/\/$/, "")}/api/history/key-shares`
}

function auth(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` }
}
