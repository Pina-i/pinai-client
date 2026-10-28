import type { InstanceIntro, InstanceMember, IssuedLink, OpenInvitation } from "@pinai/domain/models/instance-admin"
import type { IInstanceAdminPort } from "@pinai/domain/ports/instance-admin.port"

import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"

/** `/api/admin/*`: what an instance's admins do. */
export class InstanceAdminApiAdapter implements IInstanceAdminPort {
    async getIntro(idpUrl: string, accessToken: string): Promise<InstanceIntro> {
        try {
            return await idp.get(`${base(idpUrl)}/api/admin/intro`, bearer(accessToken)).json<InstanceIntro>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to load the name and description")
        }
    }

    async saveIntro(idpUrl: string, accessToken: string, intro: InstanceIntro): Promise<InstanceIntro> {
        try {
            return await idp
                .put(`${base(idpUrl)}/api/admin/intro`, {
                    ...bearer(accessToken),
                    json: { name: intro.name, description: intro.description },
                })
                .json<InstanceIntro>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to save the name and description")
        }
    }

    async listMembers(idpUrl: string, accessToken: string): Promise<InstanceMember[]> {
        try {
            return await idp.get(`${base(idpUrl)}/api/admin/members`, bearer(accessToken)).json<InstanceMember[]>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to load the members")
        }
    }

    async listInvitations(idpUrl: string, accessToken: string): Promise<OpenInvitation[]> {
        try {
            return await idp.get(`${base(idpUrl)}/api/admin/invitations`, bearer(accessToken)).json<OpenInvitation[]>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to load the invitations")
        }
    }

    async createInvitation(idpUrl: string, accessToken: string): Promise<IssuedLink & { id: string }> {
        try {
            return await idp
                .post(`${base(idpUrl)}/api/admin/invitations`, bearer(accessToken))
                .json<IssuedLink & { id: string }>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to create the invitation")
        }
    }

    async revokeInvitation(idpUrl: string, accessToken: string, invitationId: string): Promise<void> {
        try {
            await idp.delete(`${base(idpUrl)}/api/admin/invitations/${encodeURIComponent(invitationId)}`, bearer(accessToken))
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to revoke the invitation")
        }
    }

    async issuePasswordReset(idpUrl: string, accessToken: string, memberId: string): Promise<IssuedLink> {
        try {
            return await idp
                .post(`${base(idpUrl)}/api/admin/members/${encodeURIComponent(memberId)}/password-reset`, bearer(accessToken))
                .json<IssuedLink>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to create the reset link")
        }
    }
}

function base(idpUrl: string): string {
    return idpUrl.replace(/\/$/, "")
}

function bearer(accessToken: string) {
    return { headers: { Authorization: `Bearer ${accessToken}` } }
}
