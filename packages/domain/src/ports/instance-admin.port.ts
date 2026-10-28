import type { InstanceIntro, InstanceMember, IssuedLink, OpenInvitation } from "../models/instance-admin"

/**
 * The IdP's admin API, for an admin's bearer token: anyone else is refused `IdpError` 403. Every
 * refusal is an `IdpError`.
 */
export interface IInstanceAdminPort {
    /** How the instance introduces itself, as an admin or `.env` wrote it. */
    getIntro(idpUrl: string, accessToken: string): Promise<InstanceIntro>
    /** Both fields, as one text: answered as saved (trimmed, a blank one `null`); refused `400` past a limit. */
    saveIntro(idpUrl: string, accessToken: string, intro: InstanceIntro): Promise<InstanceIntro>
    /** The members, the most recently active first. */
    listMembers(idpUrl: string, accessToken: string): Promise<InstanceMember[]>
    /** The invitations still open, newest first. */
    listInvitations(idpUrl: string, accessToken: string): Promise<OpenInvitation[]>
    /** A link that lets one person create an account; refused `409` on an open instance. */
    createInvitation(idpUrl: string, accessToken: string): Promise<IssuedLink & { id: string }>
    /** Refused `404` for one no longer open. */
    revokeInvitation(idpUrl: string, accessToken: string, invitationId: string): Promise<void>
    /**
     * A link that sets a new password for a member who is no admin, replacing their open one. Takes
     * a recent password (`needsRecentSignIn`).
     */
    issuePasswordReset(idpUrl: string, accessToken: string, memberId: string): Promise<IssuedLink>
}
