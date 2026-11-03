/**
 * What the IdP answered when it refused a request: `{ error, error_description, actor_uri? }`
 * with its status. The message is the description — the words a person can read.
 */
export class IdpError extends Error {
    readonly status: number
    readonly code: string
    /** Whom the refusal names, such as the group invitee who can't be added. */
    readonly actorUri: string | null

    constructor(status: number, code: string, message: string, actorUri: string | null = null) {
        super(message)
        this.name = "IdpError"
        this.status = status
        this.code = code
        this.actorUri = actorUri
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
