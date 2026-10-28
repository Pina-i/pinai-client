import { IdpError } from "./idp-error"
import type { InstanceInfo } from "./instance"

/**
 * What an instance's admins see and do in Settings → Instance: how it introduces itself, its
 * members, the invitations still open, and a reset link for a member who forgot their password.
 * Dates are RFC 3339.
 */

/** How the instance introduces itself, as written: `null` is the default, the domain for the name, no description. */
export interface InstanceIntro {
    name: string | null
    description: string | null
}

export type IntroField = keyof InstanceIntro

const INTRO_FIELDS: readonly IntroField[] = ["name", "description"]

/** The IdP's limits, in characters. */
export const INTRO_LIMITS: Readonly<Record<IntroField, number>> = { name: 40, description: 90 }

/** What the sign-in pages read with no description. */
export const DEFAULT_HEADLINE = "An identity provider."

export interface IntroDraft {
    /** What a save sends. */
    text: InstanceIntro
    /** In characters, as the IdP counts them. */
    length: Record<IntroField, number>
    /** The fields past their limit, the name first, as the IdP checks them. */
    over: IntroField[]
}

// Code points, as the IdP counts characters: `.length` counts an emoji twice and would refuse what it takes.
const characters = (text: string | null) => (text === null ? 0 : [...text].length)

const given = (raw: string) => raw.trim() || null

/** The form's fields as the IdP would take them: each trimmed, a blank one the default. */
export function introDraft(name: string, description: string): IntroDraft {
    const text = { name: given(name), description: given(description) }
    const length = { name: characters(text.name), description: characters(text.description) }
    return { text, length, over: INTRO_FIELDS.filter((field) => length[field] > INTRO_LIMITS[field]) }
}

export interface IntroPreview {
    headline: string
    /** No description: the headline is the pages' own. */
    defaultHeadline: boolean
    /** "Sign in to Aotearoa", the sign-in form's title. */
    signIn: string
}

/** How the sign-in pages read the text, their defaults for what is left blank. */
export function introPreview(text: InstanceIntro, host: string): IntroPreview {
    return {
        headline: text.description ?? DEFAULT_HEADLINE,
        defaultHeadline: text.description === null,
        signIn: `Sign in to ${text.name ?? host}`,
    }
}

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

/** The panel is an admin's, on open and invite-only instances alike. */
export function managesInstance(admin: boolean, info: InstanceInfo | null): boolean {
    return admin && info !== null
}

/** Members, invitations and reset links: on an open instance, people sign up and reset their passwords themselves. */
export function managesRoster(info: InstanceInfo): boolean {
    return !info.openRegistrations
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
