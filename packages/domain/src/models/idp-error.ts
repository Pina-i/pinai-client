/**
 * What the IdP answered when it refused a request: `{ error, error_description, actor_uri? }`
 * with its status. The message is the description — the words a person can read.
 */
export class IdpError extends Error {
    readonly status: number
    readonly code: string
    /** Whom the refusal names, such as the group invitee who can't be added. */
    readonly actorUri: string | null
    /** When a start over request matures, for `start_over_not_ready`: epoch ms on the IdP's clock. */
    readonly readyAt: number | null

    constructor(status: number, code: string, message: string, actorUri: string | null = null, readyAt: number | null = null) {
        super(message)
        this.name = "IdpError"
        this.status = status
        this.code = code
        this.actorUri = actorUri
        this.readyAt = readyAt
    }
}

/** RFC 9470: the action takes a password typed on this session in the last minutes. */
export const RECENT_SIGN_IN_REQUIRED = "insufficient_user_authentication"

/** The IdP asks for the password again before it does this: the user signs in again, then retries. */
export function needsRecentSignIn(error: unknown): boolean {
    return error instanceof IdpError && error.code === RECENT_SIGN_IN_REQUIRED
}

/** The session names another device than the one asking: `identity-provider/specs/auth.md § 1`, "Sessions and devices". */
export const DEVICE_MISMATCH = "device_mismatch"

/**
 * This device's storage was wiped while its session lived, so the session still names the device
 * it was: the device signs in afresh, and registers from a session of its own.
 */
export function isDeviceMismatch(error: unknown): boolean {
    return error instanceof IdpError && error.code === DEVICE_MISMATCH
}

/**
 * Naming the device on the session took a proof the IdP didn't take: no root key registered there
 * for it, or another one (`identity-provider/specs/auth.md § 1`, "Sessions and devices").
 */
export const DEVICE_PROOF_INVALID = "device_proof_invalid"

export function isDeviceProofInvalid(error: unknown): boolean {
    return error instanceof IdpError && error.code === DEVICE_PROOF_INVALID
}

/** The session hasn't named its device yet: what takes the naming waits for it. */
export const DEVICE_REQUIRED = "device_required"

export function isDeviceRequired(error: unknown): boolean {
    return error instanceof IdpError && error.code === DEVICE_REQUIRED
}

/**
 * Only a device approved under the account's history key does this: revoke an approved device, turn
 * the second factor on, read or end another device's start over request, save to or clear the history
 * backup, sign the other devices out (`identity-provider/specs/e2ee.md § 3.8`, § 3.12).
 */
export const APPROVAL_REQUIRED = "approval_required"

export function isApprovalRequired(error: unknown): boolean {
    return error instanceof IdpError && error.code === APPROVAL_REQUIRED
}

/** Asking to start over from a device approved under the key in force: it replaces the words itself. */
export const ALREADY_APPROVED = "already_approved"

/** Asking to start over on an account with no history key: the first generation needs no request. */
export const NO_HISTORY_KEY = "no_history_key"

/** Asking to start over while another device's request is open: one at a time. */
export const START_OVER_PENDING = "start_over_pending"

/** Setting the next generation from a device not approved, without a request of its own open. */
export const START_OVER_REQUIRED = "start_over_required"

/** The same, its request not matured yet: the refusal carries when it does (`readyAt`). */
export const START_OVER_NOT_READY = "start_over_not_ready"

/** An upload, a report or an approval naming a generation that isn't the history key's current one. */
export const STALE_HISTORY_KEY = "stale_history_key"

export function isStaleHistoryKey(error: unknown): boolean {
    return error instanceof IdpError && error.code === STALE_HISTORY_KEY
}

/** Another device set that generation of the history key first. */
export const HISTORY_KEY_CONFLICT = "history_key_conflict"

export function isHistoryKeyConflict(error: unknown): boolean {
    return error instanceof IdpError && error.code === HISTORY_KEY_CONFLICT
}

/**
 * The IdP couldn't be had: no answer at all — a failed fetch is a `TypeError`, a timeout a
 * `TimeoutError` — or a server failing (`5xx`). A refusal, or an answer that makes no sense, is not.
 */
export function isUnreachable(error: unknown): boolean {
    if (error instanceof IdpError) return error.status >= 500
    return error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")
}
