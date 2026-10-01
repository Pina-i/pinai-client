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
