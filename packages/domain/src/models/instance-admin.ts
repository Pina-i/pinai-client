import { IdpError } from "./idp-error"
import type { InstanceInfo } from "./instance"

/**
 * What an instance's admins see and do in Settings → Instance: its members, the invitations still
 * open, and a reset link for a member who forgot their password. Dates are RFC 3339.
 */

/** A member as `GET /api/admin/members` names one: by display name only, never a handle or an address. */
export interface InstanceMember {
    id: string
    display_name: string | null
    admin: boolean
    /** The latest use of a live session of it; `null` when it is signed out everywhere. */
    last_active_at: string | null
    online: boolean
}

/** An invitation nobody used yet, as `GET /api/admin/invitations` lists it: its link is gone. */
export interface OpenInvitation {
    id: string
    created_at: string
    expires_at: string
    created_by: { display_name: string | null }
}

/** An invitation or a reset link as it is made: the only answer its token is ever in. */
export interface IssuedLink {
    link: string
    expires_at: string
}

/** The panel is an admin's, on an invite-only instance: on an open one, people sign up themselves. */
export function managesInstance(admin: boolean, info: InstanceInfo | null): boolean {
    return admin && info !== null && !info.openRegistrations
}

/** An admin gets no reset link: they recover through `ADMIN_EMAIL` and `ADMIN_PASSWORD`. */
export function offersPasswordReset(member: InstanceMember): boolean {
    return !member.admin
}

export type MemberActivity = { kind: "online" } | { kind: "seen"; at: string } | { kind: "signed-out" }

/** Online, else when a session of it was last used, else signed out everywhere. */
export function memberActivity(member: InstanceMember): MemberActivity {
    if (member.online) return { kind: "online" }
    if (member.last_active_at !== null) return { kind: "seen", at: member.last_active_at }
    return { kind: "signed-out" }
}

/** Every admin route refuses anyone but an admin `403`: the account is no admin, or no longer. */
export function refusedAsNonAdmin(error: unknown): boolean {
    return error instanceof IdpError && error.status === 403
}
