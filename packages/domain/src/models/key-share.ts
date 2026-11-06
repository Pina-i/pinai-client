/**
 * Key shares (`identity-provider/specs/e2ee.md § 3.11`): the account's passphrase sealed by a
 * device holding it for a handshake partner that doesn't, signed by the sender's root key. Who is
 * shared with, the words as a share carries them, and what the instance's refusals mean. The seal
 * and the signatures are `@pinai/crypto`'s.
 */

import { sameBytes } from "./bytes"
import type { DeviceApproval, DeviceListEntry } from "./device"
import { duplicateDeviceIds, type HandshakePartner } from "./device-trust"
import type { DeviceId } from "./e2ee"
import { IdpError } from "./idp-error"

/** HPKE's `info` for a share, as ASCII bytes. */
export const KEY_SHARE_INFO = "pinai/history-key-share/v1"
export const SHARE_ENC_BYTES = 32
export const SHARE_CIPHERTEXT_MAX_BYTES = 1024
export const SHARE_SIGNATURE_BYTES = 64
const SHARE_WORD_COUNT = 24

/** A share as the sender sends it (`POST /api/history/key-shares`). */
export interface OutgoingKeyShare {
    recipientDeviceId: DeviceId
    generation: number
    enc: Uint8Array
    ciphertext: Uint8Array
    signature: Uint8Array
}

/** The share waiting for this device (`GET /api/history/key-shares`). */
export interface KeyShare {
    senderDeviceId: DeviceId
    generation: number
    enc: Uint8Array
    ciphertext: Uint8Array
    signature: Uint8Array
    createdAt: string
}

/** The words as a share carries them: a BIP-39 mnemonic, lowercase, single spaces. */
export function shareText(words: readonly string[]): string {
    return words.map((word) => word.trim().toLowerCase()).join(" ")
}

/** The 24 words a share opened to; `null` for anything not written as `shareText` writes them. */
export function shareWords(text: string): string[] | null {
    const words = text.split(" ")
    if (words.length !== SHARE_WORD_COUNT || !words.every((word) => /^[a-z]+$/.test(word))) return null
    return words
}

/** A partner the list shows waiting for the generation, with the approvals `@pinai/crypto` verifies before sealing. */
export interface ShareCandidate {
    partner: HandshakePartner
    /** Its row: the HPKE key is read from it. */
    row: DeviceListEntry
    /** Listed on its row, by this device. */
    byThisDevice: DeviceApproval[]
    /** Listed on this device's row, by it: the handshake finished on its side too. */
    byPartner: DeviceApproval[]
}

/**
 * Why the sender shares nothing with a partner, and warns: the list shows another root key than the
 * exchange gave (`root-key`), an HPKE key that root key didn't sign or none (`hpke-key`), or a chain
 * JWKS → attestation → root key that doesn't verify (`attestation`).
 */
export type ShareRecipientRefusal = "root-key" | "hpke-key" | "attestation"

/**
 * The partners to share `generation` with (§ 3.11 "The sender's rules"): listed once, unrevoked —
 * nor seen revoked —, not holding it, not forgone, approved by this device and having approved it
 * back. One whose listed root key isn't the one the exchange gave is refused before its approvals
 * are read: the list only shows approvals binding the root key it lists. From a list naming an id
 * twice, nobody.
 */
export function shareCandidates(input: {
    partners: readonly HandshakePartner[]
    devices: readonly DeviceListEntry[]
    thisDevice: DeviceId
    generation: number
    revokedSeen: readonly DeviceId[]
    forgone: (deviceId: DeviceId, generation: number) => boolean
}): { candidates: ShareCandidate[]; refused: Array<{ deviceId: DeviceId; reason: "root-key" }> } {
    const { devices, thisDevice, generation } = input
    if (duplicateDeviceIds(devices.map((d) => d.device_id)).length > 0) return { candidates: [], refused: [] }
    const own = devices.find((d) => d.device_id === thisDevice)?.approvals ?? []
    const candidates: ShareCandidate[] = []
    const refused: Array<{ deviceId: DeviceId; reason: "root-key" }> = []
    for (const deviceId of new Set(input.partners.map((p) => p.deviceId))) {
        const row = devices.find((d) => d.device_id === deviceId)
        if (!row || deviceId === thisDevice || row.revoked_at !== null || input.revokedSeen.includes(deviceId)) continue
        if (row.history_generation === generation || input.forgone(deviceId, generation)) continue
        const listedRoot = row.drk_public_key
        const partner = input.partners.find((p) => p.deviceId === deviceId && listedRoot !== null && sameBytes(p.rootKey, listedRoot))
        if (!partner) {
            refused.push({ deviceId, reason: "root-key" })
            continue
        }
        const byThisDevice = row.approvals.filter((a) => a.by === "device" && a.device_id === thisDevice)
        const byPartner = own.filter((a) => a.by === "device" && a.device_id === deviceId)
        if (byThisDevice.length > 0 && byPartner.length > 0) candidates.push({ partner, row, byThisDevice, byPartner })
    }
    return { candidates, refused }
}

/**
 * Why a received share is left unused, by the check of § 3.11 it failed, in order: its sender isn't
 * a partner (`not-a-partner`, one seen revoked included), the signature doesn't verify under the
 * root key the exchange gave (`signature`), the seal doesn't open to 24 words (`seal`), the words
 * don't give the generation's check value (`check-value`) or its approval key (`approval-key`).
 */
export type KeyShareRefusal = "not-a-partner" | "signature" | "seal" | "check-value" | "approval-key"

/**
 * What a refusal of `POST /api/history/key-shares` means, by its code: `final` for that recipient
 * and generation — sending again can't succeed —; `stale`, this device's generation isn't the
 * current one; `later`, what it waits on may change by the next refresh, or no answer came.
 */
export type ShareRefusalMeaning = "final" | "stale" | "later"

const FINAL_CODES = new Set(["history_key_held", "not_the_approver", "access_denied", "not_found", "invalid_request"])

export function shareRefusal(error: unknown): ShareRefusalMeaning {
    if (!(error instanceof IdpError)) return "later"
    if (error.code === "stale_history_key") return "stale"
    if (FINAL_CODES.has(error.code)) return "final"
    // `not_approved`, `no_hpke_key`, `no_root_key`, `history_key_not_held`, `device_required`, a `5xx`.
    return "later"
}
