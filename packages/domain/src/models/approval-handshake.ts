/**
 * The code handshake's rules (`identity-provider/specs/e2ee.md § 3.10`): who asks and who answers,
 * what a close means at each step, the peer's keys against the device list, which requests a device
 * may answer, the code as typed, and when the asking device draws a new code by itself. The byte
 * format and the crypto are `@pinai/crypto`'s.
 */

import { sameBytes } from "./bytes"
import type { DeviceListEntry } from "./device"
import { actsOnApproval, duplicateDeviceIds, type HandshakeKeysRefusal, type HandshakePartner } from "./device-trust"
import type { DeviceId } from "./e2ee"
import type { HistoryKeyStanding } from "./history-key"
import { IdpError } from "./idp-error"

export const APPROVAL_CODE_LENGTH = 6
/** A request lives 10 minutes on the relay; the asking device counts them on its own clock. */
export const APPROVAL_REQUEST_LIFETIME_MS = 10 * 60_000
/** The relay's limit is 10 an account an hour: a page asking keeps under it, leaving room for another device. */
export const ASKER_REQUESTS_PER_HOUR = 8
/** After a `429` from the relay, which says no more. */
export const RATE_LIMITED_RETRY_MS = 5 * 60_000
/** An instance out of reach, before a request opened, is asked again after this. */
export const UNREACHABLE_RETRY_MS = 30_000
/** The answering side gives up an exchange this long after the code was typed. */
export const ANSWER_TIMEOUT_MS = 3 * 60_000
/** Between reads of the relay while an exchange runs, then after 1, 2, 3+ failures in a row. */
export const POLL_BACKOFF_MS = [3_000, 6_000, 12_000, 30_000] as const
const HOUR_MS = 60 * 60_000

export type HandshakeRole = "asker" | "answerer"

/** An open request, as `GET /api/keys/devices/approval-requests` lists it. */
export interface ApprovalRequest {
    id: string
    /** The device asking. */
    deviceId: DeviceId
    displayName: string
    /** The device answering; `null` until one posts. */
    approverDeviceId: DeviceId | null
    createdAt: string
    expiresAt: string
}

/** A request's message as the relay hands it over: opaque, the poster's device named. */
export interface RelayMessage {
    seq: number
    deviceId: DeviceId
    body: Uint8Array
    createdAt: string
}

/** A device's public keys as the exchange carried them, never as the list shows them. */
export interface ExchangedKeys {
    rootKey: Uint8Array
    hpkeKey: Uint8Array
}

/**
 * Where a side stands. `ready`: the answerer waits for the code to be typed. `waiting`: the
 * asker's share is out and the answerer's not in. `confirming`: the shares crossed, the peer's
 * confirmation awaited. `exchanging`: the answerer confirmed and sent its keys. `approving`: the
 * peer's keys checked, the approvals under way.
 */
export type HandshakePhase = "ready" | "waiting" | "confirming" | "exchanging" | "approving"

export type HandshakeFailure =
    /** A confirmation that didn't verify: a wrong code, or someone in the middle without it. */
    | "wrong-code"
    /** A message out of format, or a seal that didn't open. */
    | "tampered"
    /** The peer's keys aren't the ones listed for it, or its chain doesn't verify. */
    | "keys-refused"
    | "ended"
    | "expired"
    /** Another device answered first. */
    | "taken"
    /** This device doesn't act on approval: it never answers. */
    | "not-acting"
    /** The user gave the exchange up. */
    | "cancelled"
    | "error"

export type HandshakeOutcome = { kind: "approved"; partner: HandshakePartner } | { kind: "failed"; reason: HandshakeFailure }

/** What a session throws on a message it refuses: the request is then ended, nothing else sent. */
export class HandshakeRefused extends Error {
    readonly reason: "wrong-code" | "tampered"

    constructor(reason: "wrong-code" | "tampered", message: string) {
        super(message)
        this.name = "HandshakeRefused"
        this.reason = reason
    }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A device or request id as § 7.2 writes it, lowercase; `null` for what is no UUID. */
export function canonicalId(value: unknown): string | null {
    return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null
}

/** The asking side doesn't hold the current passphrase: a new device, or an old one after a start over. */
export function mayAsk(standing: HistoryKeyStanding): boolean {
    return standing.kind !== "holds"
}

/** The answering side acts on approval (§ 3.9): it holds the passphrase and found the approval key its own. */
export function mayAnswer(standing: HistoryKeyStanding): boolean {
    return actsOnApproval(standing)
}

/**
 * A close the side didn't make, read at the step it came: the asker waiting for the answerer's
 * confirmation meets the answerer refusing its own — a wrong code. Anything else ended the request.
 */
export function closedMeans(role: HandshakeRole, phase: HandshakePhase): HandshakeFailure {
    return role === "asker" && phase === "confirming" ? "wrong-code" : "ended"
}

/** A relay refusal as the handshake reads it; `null` for anything else, an instance out of reach included. */
export function relayRefusal(error: unknown): HandshakeFailure | null {
    if (!(error instanceof IdpError)) return null
    if (error.code === "approval_request_taken") return "taken"
    if (error.code === "approval_request_ended" || error.status === 404) return "ended"
    // Five messages make an exchange: a request full of twelve held someone else's.
    if (error.code === "approval_request_full") return "tampered"
    if (error.status === 403 || error.code === "no_root_key") return "error"
    return null
}

/** The relay asking to slow down, on any route. */
export function isTooManyRequests(error: unknown): boolean {
    return error instanceof IdpError && (error.code === "too_many_requests" || error.status === 429)
}

/** A refusal the same request would meet again: retrying can't help, unlike a lost answer or a `5xx`. */
export function isRefusedForGood(error: unknown): boolean {
    return error instanceof IdpError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429
}

/**
 * The peer's keys from the exchange against the list; its root chain is checked beside this. A
 * list naming an id twice decides nothing (§ 3.9).
 */
export function peerAgainstList(
    devices: readonly DeviceListEntry[],
    peer: HandshakePartner,
    revokedSeen: readonly DeviceId[],
): Exclude<HandshakeKeysRefusal, "attestation"> | "duplicated" | null {
    if (duplicateDeviceIds(devices.map((d) => d.device_id)).length > 0) return "duplicated"
    const row = devices.find((d) => d.device_id === peer.deviceId)
    if (!row) return "not-listed"
    if (row.revoked_at !== null || revokedSeen.includes(peer.deviceId)) return "revoked"
    if (!row.drk_public_key || !sameBytes(row.drk_public_key, peer.rootKey)) return "root-key"
    if (!row.hpke_public_key || !sameBytes(row.hpke_public_key, peer.hpkeKey)) return "hpke-key"
    return null
}

/**
 * The requests the Door may offer, oldest first: another device's, nobody's answer yet, not set
 * aside here, none unless this device acts. One this device answered — another tab, or before a
 * reload that lost the exchange's keys — never comes back; the relay lists only open ones.
 */
export function answerableRequests(
    requests: readonly ApprovalRequest[],
    input: { thisDevice: DeviceId; acting: boolean; dismissed: ReadonlySet<string> },
): ApprovalRequest[] {
    if (!input.acting) return []
    return requests
        .filter((r) => r.deviceId !== input.thisDevice && r.approverDeviceId === null && !input.dismissed.has(r.id))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

/** A failure the Door says; the others close it: another device answered, or the request went before an answer. */
export function failureShown(reason: HandshakeFailure, phase: HandshakePhase): boolean {
    if (reason === "taken" || reason === "cancelled") return false
    return !(reason === "ended" && phase === "ready")
}

/** What the next request from the same device says on the Door: a wrong code, to type the new one. */
export function noteForNext(reason: HandshakeFailure): HandshakeFailure | null {
    return reason === "wrong-code" ? reason : null
}

/** What was typed or pasted, as the code's digits: anything else dropped, six at most. */
export function codeDigits(text: string): string {
    return text.replace(/\D/g, "").slice(0, APPROVAL_CODE_LENGTH)
}

export function isWholeCode(code: string): boolean {
    return code.length === APPROVAL_CODE_LENGTH && /^\d+$/.test(code)
}

/** The code as it is shown and typed: 3 + 3. */
export function codeHalves(code: string): [string, string] {
    return [code.slice(0, 3), code.slice(3, 6)]
}

/** Under the relay's 10 an hour, with room left for another device of the account to ask. */
export function nextRequestAt(openedAt: readonly number[], now: number): number {
    const lastHour = openedAt.filter((at) => at > now - HOUR_MS).sort((a, b) => a - b)
    if (lastHour.length < ASKER_REQUESTS_PER_HOUR) return now
    return lastHour[lastHour.length - ASKER_REQUESTS_PER_HOUR] + HOUR_MS
}

/**
 * § 2's promise that each of the instance's guesses costs the user an action: a code is renewed
 * without one only when nobody answered it and its 10 minutes ran out on this device's own clock.
 */
export function renewsByItself(input: { reason: HandshakeFailure; answered: boolean; openedAt: number; now: number }): boolean {
    return input.reason === "expired" && !input.answered && input.now >= input.openedAt + APPROVAL_REQUEST_LIFETIME_MS
}

/** Before the next read of the relay: longer after failures in a row, much longer when it asked to slow down. */
export function pollDelay(failuresInARow: number, lastError: unknown): number {
    if (failuresInARow > 0 && isTooManyRequests(lastError)) return RATE_LIMITED_RETRY_MS
    return POLL_BACKOFF_MS[Math.min(failuresInARow, POLL_BACKOFF_MS.length - 1)]
}

/** The ring's share of the request's life still to run, 0 to 1. */
export function requestLifeLeft(deadline: number, now: number): number {
    return Math.min(1, Math.max(0, (deadline - now) / APPROVAL_REQUEST_LIFETIME_MS))
}

/** "new in 8 min", "new in 40 s": when the next code comes. */
export function nextCodeWording(deadline: number, now: number): string {
    const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
    return seconds < 60 ? `new in ${seconds} s` : `new in ${Math.ceil(seconds / 60)} min`
}
