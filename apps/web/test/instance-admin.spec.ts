/**
 * Settings → Instance: shown to an admin of an invite-only instance only; members by display
 * name, with their last activity and a reset link for those who are no admin; invitations with
 * how long they stay open; and a link made in a row lasting only as long as the row is open.
 */
import { describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import {
    type InstanceMember,
    managesInstance,
    memberActivity,
    offersPasswordReset,
    refusedAsNonAdmin,
} from "@pinai/domain/models/instance-admin"
import type { IInstanceAdminPort } from "@pinai/domain/ports/instance-admin.port"
import type { INodeInfoPort } from "@pinai/domain/ports/instance.port"
import { managedInstanceUseCase } from "@pinai/domain/usecases/instance/managed-instance.usecase"
import { revokeInvitationUseCase } from "@pinai/domain/usecases/instance/revoke-invitation.usecase"
import {
    CLOSED,
    pendingInvitation,
    rosterMember,
    rosterReducer,
    rosterTitle,
    sameRow,
} from "@/presentation/pages/home/SettingsModal/InstanceEditor/InstanceEditor.viewmodel"

const SCHEMA_21 = "http://nodeinfo.diaspora.software/ns/schema/2.1"

function member(change: Partial<InstanceMember>): InstanceMember {
    return { id: "m1", display_name: "Mika", admin: false, last_active_at: null, online: false, ...change }
}

describe("managesInstance", () => {
    const invite = { name: "Aotearoa", users: 9, openRegistrations: false }

    it("is an admin's, on an invite-only instance", () => {
        expect(managesInstance(true, invite)).toBe(true)
    })

    it("is nobody's on an open instance, where people sign up themselves, nor a member's", () => {
        expect(managesInstance(true, { ...invite, openRegistrations: true })).toBe(false)
        expect(managesInstance(false, invite)).toBe(false)
        expect(managesInstance(true, null)).toBe(false)
    })
})

describe("managedInstanceUseCase", () => {
    function nodeInfo(openRegistrations: boolean) {
        const links = vi.fn(async () => ({ links: [{ rel: SCHEMA_21, href: "/nodeinfo/2.1" }] }))
        const port: INodeInfoPort = {
            links,
            document: async () => ({
                software: { name: "pinai" },
                openRegistrations,
                usage: { users: { total: 9 } },
                metadata: { nodeName: "Aotearoa" },
            }),
        }
        return { port, links }
    }

    it("reads the instance an admin manages", async () => {
        const { port } = nodeInfo(false)
        expect(await managedInstanceUseCase("https://aotearoa.nz", true, port)).toEqual({
            name: "Aotearoa",
            users: 9,
            openRegistrations: false,
        })
    })

    it("has no panel on an open instance", async () => {
        const { port } = nodeInfo(true)
        expect(await managedInstanceUseCase("https://aotearoa.nz", true, port)).toBeNull()
    })

    it("asks NodeInfo nothing for a member", async () => {
        const { port, links } = nodeInfo(false)
        expect(await managedInstanceUseCase("https://aotearoa.nz", false, port)).toBeNull()
        expect(links).not.toHaveBeenCalled()
    })
})

describe("a member's row", () => {
    it("offers a reset link to a member who is no admin only", () => {
        expect(offersPasswordReset(member({}))).toBe(true)
        expect(offersPasswordReset(member({ admin: true }))).toBe(false)
    })

    it("is online, else seen when a session of it was last used, else signed out everywhere", () => {
        expect(memberActivity(member({ online: true, last_active_at: "2026-10-27T09:00:00Z" }))).toEqual({ kind: "online" })
        expect(memberActivity(member({ last_active_at: "2026-10-27T09:00:00Z" }))).toEqual({
            kind: "seen",
            at: "2026-10-27T09:00:00Z",
        })
        expect(memberActivity(member({}))).toEqual({ kind: "signed-out" })
    })
})

describe("refusedAsNonAdmin", () => {
    it("is the IdP's 403, and nothing else", () => {
        expect(refusedAsNonAdmin(new IdpError(403, "access_denied", "Only an admin may do this"))).toBe(true)
        expect(refusedAsNonAdmin(new IdpError(401, "insufficient_user_authentication", "Sign in again"))).toBe(false)
        expect(refusedAsNonAdmin(new IdpError(404, "not_found", "Invitation not found"))).toBe(false)
        expect(refusedAsNonAdmin(new Error("Failed to fetch"))).toBe(false)
    })
})

describe("rosterTitle", () => {
    it("counts the members in words, as the design writes it", () => {
        expect(rosterTitle(1)).toBe("Just you, and room for more.")
        expect(rosterTitle(9)).toBe("Nine people, and room for more.")
        expect(rosterTitle(20)).toBe("Twenty people, and room for more.")
        expect(rosterTitle(1204)).toBe("1,204 people, and room for more.")
    })

    it("names nobody before the list is read", () => {
        expect(rosterTitle(null)).toBe("Who's here.")
    })
})

describe("rosterReducer", () => {
    const invite = { kind: "invite" } as const
    const mika = { kind: "reset", memberId: "mika" } as const
    const link = { link: "https://aotearoa.nz/i/TOKEN", expires_at: "2026-11-03T12:00:00Z" }

    it("opens one row at a time, and closes it when toggled again", () => {
        const opened = rosterReducer(CLOSED, { type: "toggle", row: invite })
        expect(opened).toEqual({ open: invite, issued: null })
        expect(rosterReducer(opened, { type: "toggle", row: mika })).toEqual({ open: mika, issued: null })
        expect(rosterReducer(opened, { type: "toggle", row: invite })).toEqual(CLOSED)
    })

    it("shows a link made in the open row until the row closes", () => {
        const shown = rosterReducer({ open: mika, issued: null }, { type: "issued", row: mika, link })
        expect(shown).toEqual({ open: mika, issued: link })
        expect(rosterReducer(shown, { type: "close" })).toEqual(CLOSED)
        expect(rosterReducer(shown, { type: "toggle", row: invite })).toEqual({ open: invite, issued: null })
    })

    it("never shows a link again once its row closed, reopened or not", () => {
        const shown = rosterReducer({ open: mika, issued: null }, { type: "issued", row: mika, link })
        const closed = rosterReducer(shown, { type: "close" })
        expect(rosterReducer(closed, { type: "toggle", row: mika })).toEqual({ open: mika, issued: null })
        const toggledShut = rosterReducer(shown, { type: "toggle", row: mika })
        expect(rosterReducer(toggledShut, { type: "toggle", row: mika })).toEqual({ open: mika, issued: null })
    })

    it("drops a link answered after its row was closed or another opened", () => {
        expect(rosterReducer(CLOSED, { type: "issued", row: mika, link })).toEqual(CLOSED)
        const other = { kind: "reset", memberId: "teva" } as const
        expect(rosterReducer({ open: other, issued: null }, { type: "issued", row: mika, link })).toEqual({
            open: other,
            issued: null,
        })
    })
})

describe("sameRow", () => {
    it("is the invite row, or one member's reset row", () => {
        expect(sameRow({ kind: "invite" }, { kind: "invite" })).toBe(true)
        expect(sameRow({ kind: "reset", memberId: "a" }, { kind: "reset", memberId: "a" })).toBe(true)
        expect(sameRow({ kind: "reset", memberId: "a" }, { kind: "reset", memberId: "b" })).toBe(false)
        expect(sameRow({ kind: "invite" }, { kind: "reset", memberId: "a" })).toBe(false)
        expect(sameRow(null, { kind: "invite" })).toBe(false)
    })
})

describe("the rows' wording", () => {
    const now = new Date("2026-10-27T12:00:00Z")

    it("says a member is online, when they were last seen, or that they are signed out everywhere", () => {
        expect(rosterMember(member({ online: true }), null, now).activity).toBe("online")
        expect(rosterMember(member({ last_active_at: "2026-10-24T12:00:00Z" }), null, now).activity).toBe("seen 3 days ago")
        expect(rosterMember(member({}), null, now).activity).toBe("signed out")
        expect(rosterMember(member({ last_active_at: "garbled" }), null, now).activity).toBe("signed in")
    })

    it("names a member by display name only, marks the reader, and offers no reset for an admin", () => {
        const me = rosterMember(member({ id: "me", display_name: "Hōkū", admin: true }), "me", now)
        expect(me).toMatchObject({ name: "Hōkū", initials: "HŌ", isYou: true, canReset: false })
        expect(rosterMember(member({ display_name: null }), "me", now)).toMatchObject({ name: "Unnamed", isYou: false, canReset: true })
    })

    it("says who made an invitation, when, and when it stops working", () => {
        const invitation = {
            id: "i1",
            created_at: "2026-10-26T12:00:00Z",
            expires_at: "2026-11-02T12:00:00Z",
            created_by: { display_name: "Hōkū" },
        }
        expect(pendingInvitation(invitation, now)).toEqual({ id: "i1", made: "made by Hōkū yesterday", expires: "expires in 6 days" })
        expect(pendingInvitation({ ...invitation, expires_at: "2026-10-27T11:00:00Z" }, now).expires).toBe("expired")
        expect(
            pendingInvitation({ ...invitation, created_at: "?", expires_at: "?", created_by: { display_name: null } }, now),
        ).toEqual({ id: "i1", made: "made by an admin", expires: null })
    })
})

describe("revokeInvitationUseCase", () => {
    const port = (revokeInvitation: IInstanceAdminPort["revokeInvitation"]) => ({ revokeInvitation }) as IInstanceAdminPort

    it("revokes an open invitation", async () => {
        const revoke = vi.fn(async () => {})
        expect(await revokeInvitationUseCase("https://aotearoa.nz", "tok", "i1", port(revoke))).toBe("revoked")
        expect(revoke).toHaveBeenCalledWith("https://aotearoa.nz", "tok", "i1")
    })

    it("takes one the IdP no longer has open (404) as gone, not as a failure", async () => {
        const gone = port(async () => {
            throw new IdpError(404, "not_found", "Invitation not found")
        })
        expect(await revokeInvitationUseCase("https://aotearoa.nz", "tok", "i1", gone)).toBe("gone")
    })

    it("passes any other refusal through", async () => {
        const refused = port(async () => {
            throw new IdpError(403, "access_denied", "Only an admin may do this")
        })
        await expect(revokeInvitationUseCase("https://aotearoa.nz", "tok", "i1", refused)).rejects.toSatisfy(refusedAsNonAdmin)
    })
})
