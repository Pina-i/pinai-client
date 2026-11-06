/**
 * The account's history passphrase, in generations (`identity-provider/specs/e2ee.md § 3.6–3.9`):
 * the key `GET /api/history/key` answers, and where this device stands against it.
 */

import { sameBytes } from "./bytes"
import type { BaselineIntent } from "./device-trust"

export const FIRST_HISTORY_GENERATION = 1

/** A generation of the account's history key, as `PUT /api/history/key` sets it. */
export interface HistoryKey {
    generation: number
    /** 16 bytes, the Argon2id salt the HAK is derived under. */
    salt: Uint8Array
    /** `HMAC-SHA256(HAK, "pinai/history-archive/check-v1")`. */
    checkValue: Uint8Array
    /** The Ed25519 key whose seed is `HKDF-SHA256(HAK, "pinai/device-approval/v1")`. */
    approvalPublicKey: Uint8Array
}

/** The key in force, with the device whose session set it (`null` once its row is gone). */
export interface CurrentHistoryKey extends HistoryKey {
    setByDevice: string | null
}

/** What a passphrase gives under a generation's salt. */
export interface DerivedHistoryKey {
    checkValue: Uint8Array
    approvalPublicKey: Uint8Array
}

/** What the device kept with its words: the generation they give — that one only — and its approval. */
export interface KeptHistoryKey extends DerivedHistoryKey {
    generation: number
    salt: Uint8Array
    /** The root key the device approved itself over with these words; `null` before it did. */
    approvedRootKey: Uint8Array | null
}

/**
 * `holds` only when both values are the key's: an instance could otherwise put an approval key of
 * its own beside the right check value.
 */
export type PassphraseVerdict = "holds" | "wrong" | "key-swapped"

export function passphraseVerdict(derived: DerivedHistoryKey, key: HistoryKey): PassphraseVerdict {
    if (!sameBytes(derived.checkValue, key.checkValue)) return "wrong"
    return sameBytes(derived.approvalPublicKey, key.approvalPublicKey) ? "holds" : "key-swapped"
}

export function sameHistoryKey(a: HistoryKey, b: HistoryKey): boolean {
    return (
        a.generation === b.generation &&
        sameBytes(a.salt, b.salt) &&
        sameBytes(a.checkValue, b.checkValue) &&
        sameBytes(a.approvalPublicKey, b.approvalPublicKey)
    )
}

/**
 * `check-value`: a generation set elsewhere, or one made up; `approval-key`: the instance's own
 * approval key; `rollback`: a generation older than one seen, or none after one was; `relabelled`:
 * the kept generation's key under another number.
 */
export type MismatchReason = "check-value" | "approval-key" | "rollback" | "relabelled"

export type HistoryKeyStanding =
    | { kind: "unchecked" }
    /** `generation`: the key in force, never below the newest seen. */
    | { kind: "no-passphrase"; generation: number }
    | { kind: "no-key" }
    /** `settled` once approved by the words over the device's current root key, and reported. */
    | { kind: "holds"; generation: number; settled: boolean }
    /** The words are kept, nothing is uploaded. `generation` 0: no key in force; `held`: the kept one. */
    | {
          kind: "mismatch"
          generation: number
          setByDevice: string | null
          reason: MismatchReason
          held: number | null
      }

/**
 * Where the device stands (`identity-provider/specs/e2ee.md § 3.9`). Generations only move
 * forward: one below the newest seen is refused even when the words give it, and words give the
 * generation they were kept for, no other.
 */
export function standingAgainst(
    key: CurrentHistoryKey | null,
    kept: KeptHistoryKey | null,
    newestSeen: number | null,
    rootKey: Uint8Array | null,
): HistoryKeyStanding {
    const held = kept?.generation ?? null
    const mismatch = (reason: MismatchReason): HistoryKeyStanding => ({
        kind: "mismatch",
        generation: key?.generation ?? 0,
        setByDevice: key?.setByDevice ?? null,
        reason,
        held,
    })
    if (!key) return newestSeen ? mismatch("rollback") : { kind: "no-key" }
    if (newestSeen && key.generation < newestSeen) return mismatch("rollback")
    if (!kept) return { kind: "no-passphrase", generation: key.generation }
    const verdict = sameBytes(kept.salt, key.salt) ? passphraseVerdict(kept, key) : "wrong"
    if (kept.generation !== key.generation) return mismatch(verdict === "holds" ? "relabelled" : "check-value")
    if (verdict === "wrong") return mismatch("check-value")
    if (verdict === "key-swapped") return mismatch("approval-key")
    return { kind: "holds", generation: key.generation, settled: isSettled(kept.approvedRootKey, rootKey) }
}

/** A pending key — minted, sealed, its `PUT` unanswered —, with when it was written; `null` from before that was kept. */
export interface PendingHistoryKey extends HistoryKey {
    mintedAt: number | null
    /** Minted to replace the words this device holds. */
    rearchive?: true
    /** What its baseline keeps once the IdP took it, though the answer was lost: from before, the refused device apart. */
    intent?: BaselineIntent
}

/** A pending key written this recently may have a `PUT` on its way, from this tab or another. */
export const PENDING_KEY_FRESH_MS = 2 * 60_000

/**
 * What becomes of a pending key once the key in force is read: kept when it is that key; sent again
 * only as a first generation with no key in force, the first device's; erased otherwise — a later
 * generation's `PUT` that never landed is never sent by itself: it erases the archive, and takes the
 * user's own start over and a recent password. A row written in the last `PENDING_KEY_FRESH_MS` is
 * left for a later settle instead: its `PUT` may still land.
 */
export type PendingSettlement = "keep" | "send-again" | "erase" | "leave"

export function settlePending(
    pending: HistoryKey & { mintedAt?: number | null },
    current: HistoryKey | null,
    now: number = Date.now(),
): PendingSettlement {
    if (current && sameHistoryKey(current, pending)) return "keep"
    if (!current && pending.generation === FIRST_HISTORY_GENERATION) return "send-again"
    const age = pending.mintedAt == null ? null : now - pending.mintedAt
    return age !== null && age >= 0 && age < PENDING_KEY_FRESH_MS ? "leave" : "erase"
}

/**
 * The generation a start over sets: the one after the key in force, 1 with none. `null` unless it
 * is past every generation this device has seen: a number another device may hold is never reused.
 */
export function startOverGeneration(current: HistoryKey | null, newestSeen: number | null): number | null {
    const next = (current?.generation ?? 0) + 1
    return newestSeen !== null && next <= newestSeen ? null : next
}

/**
 * Whether the setup page may show the words this device keeps when the IdP can't be reached: only
 * the first device's generation 1 — never seen past —, and never with a key pending, whose words
 * would be the new ones.
 */
export function firstWordsShownOffline(newestSeen: number | null, pending: boolean): boolean {
    return !pending && newestSeen === FIRST_HISTORY_GENERATION
}

/** The newest generation this device has seen, a key read added. */
export function newestGenerationSeen(seen: number | null, key: HistoryKey | null): number | null {
    const newest = Math.max(seen ?? 0, key?.generation ?? 0)
    return newest > 0 ? newest : null
}

/** An approval binds the root key it was made over: a device whose root key changed approves again. */
export function isSettled(approvedRootKey: Uint8Array | null, rootKey: Uint8Array | null): boolean {
    return approvedRootKey !== null && rootKey !== null && sameBytes(approvedRootKey, rootKey)
}

/** Keeping words again keeps their approval only when they are the same words for the same generation. */
export function approvalCarriedOver(
    previous: { words: readonly string[]; generation: number; approvedRootKey: Uint8Array | null } | null,
    words: readonly string[],
    generation: number,
): Uint8Array | null {
    if (!previous || previous.generation !== generation) return null
    const same = previous.words.length === words.length && previous.words.every((word, i) => word === words[i])
    return same ? previous.approvedRootKey : null
}

/**
 * A restore due under `due`: run while the device holds that generation; moot once the key in force
 * is a later one, whose generation erased the archive; else it waits.
 */
export function dueRestore(due: number, standing: HistoryKeyStanding): "restore" | "moot" | "wait" {
    if (standing.kind === "holds" && standing.generation === due) return "restore"
    const inForce = standing.kind === "unchecked" || standing.kind === "no-key" ? null : standing.generation
    return inForce !== null && inForce > due ? "moot" : "wait"
}

/** Entries wait for the archive only while the device may yet hold the key in force. */
export function buffersForArchive(standing: HistoryKeyStanding): boolean {
    return standing.kind === "unchecked" || standing.kind === "holds"
}

/**
 * Entries go to the archive only once the device approved itself under the generation it holds —
 * its words over its root key, and reported (`settled`). The instance takes them from a device
 * approved under the key by its words or by a device so approved, and refuses any other
 * (`approval_required`): the first entry stored under an id is the one restored. Waiting for its own
 * approval is stricter, and every device holding the words makes it.
 */
export function savesToArchive(standing: HistoryKeyStanding): standing is Extract<HistoryKeyStanding, { kind: "holds" }> & { settled: true } {
    return standing.kind === "holds" && standing.settled
}

/** Saves held back may go: the device came to stand approved under a generation it didn't save under just before. */
export function opensSaves(before: HistoryKeyStanding, after: HistoryKeyStanding): boolean {
    return savesToArchive(after) && !(savesToArchive(before) && before.generation === after.generation)
}

/** A standing as it was recorded; `null` for anything else. */
export function parseHistoryKeyStanding(value: unknown): HistoryKeyStanding | null {
    if (typeof value !== "object" || value === null) return null
    const row = value as Record<string, unknown>
    switch (row.kind) {
        case "no-key":
            return { kind: row.kind }
        case "no-passphrase":
            return isGeneration(row.generation) ? { kind: row.kind, generation: row.generation } : null
        case "holds":
            return isGeneration(row.generation) && typeof row.settled === "boolean"
                ? { kind: "holds", generation: row.generation, settled: row.settled }
                : null
        case "mismatch": {
            const reasons: unknown[] = ["check-value", "approval-key", "rollback", "relabelled"]
            if (row.generation !== 0 && !isGeneration(row.generation)) return null
            if (!reasons.includes(row.reason)) return null
            if (row.setByDevice !== null && typeof row.setByDevice !== "string") return null
            if (row.held !== null && !isGeneration(row.held)) return null
            return {
                kind: "mismatch",
                generation: row.generation as number,
                setByDevice: row.setByDevice,
                reason: row.reason as MismatchReason,
                held: row.held,
            }
        }
        default:
            return null
    }
}

export function isGeneration(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}
