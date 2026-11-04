/**
 * The account's history passphrase, in generations (`identity-provider/specs/e2ee.md § 3.6–3.9`):
 * the key `GET /api/history/key` answers, and where this device stands against it.
 */

import { sameBytes } from "./bytes"

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

/** Entries wait for the archive only while the device may yet hold the key in force. */
export function buffersForArchive(standing: HistoryKeyStanding): boolean {
    return standing.kind === "unchecked" || standing.kind === "holds"
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
