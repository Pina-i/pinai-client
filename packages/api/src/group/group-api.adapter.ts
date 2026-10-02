import ky from "ky"
import { idpErrorFrom } from "../idp-error"
import type { GroupMember, GroupRole, GroupView } from "@pinai/domain/models/group"
import type { DirectMessage } from "@pinai/domain/models/dm"
import type { IGroupPort } from "@pinai/domain/ports/group.port"

/** Pull the server's `error_description` (falls back to a generic message). */
export class GroupApiAdapter implements IGroupPort {
    async createGroup(
        idpUrl: string,
        accessToken: string,
        name: string | null,
        memberActorUris: string[],
    ): Promise<GroupView> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/groups`
        try {
            return await ky
                .post(url, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { name, member_actor_uris: memberActorUris },
                })
                .json<GroupView>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to create group")
        }
    }

    async listMembers(idpUrl: string, accessToken: string, conversationId: string): Promise<GroupMember[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/groups/${conversationId}/members`
        try {
            return await ky.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }).json<GroupMember[]>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to load members")
        }
    }

    async addMember(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        actorUri: string,
    ): Promise<GroupMember> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/groups/${conversationId}/members`
        try {
            return await ky
                .post(url, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { actor_uri: actorUri },
                })
                .json<GroupMember>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to add member")
        }
    }

    async removeMember(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        actorUri: string,
    ): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/groups/${conversationId}/members/${encodeURIComponent(actorUri)}`
        try {
            await ky.delete(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to remove member")
        }
    }

    async dismissGroup(idpUrl: string, accessToken: string, conversationId: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/groups/${conversationId}`
        try {
            await ky.delete(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to remove the group from the list")
        }
    }

    async renameGroup(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        name: string,
    ): Promise<GroupView> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/groups/${conversationId}`
        try {
            return await ky
                .patch(url, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { name },
                })
                .json<GroupView>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to rename group")
        }
    }

    async setMemberRole(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        actorUri: string,
        role: GroupRole,
    ): Promise<GroupMember> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/groups/${conversationId}/members/${encodeURIComponent(actorUri)}/role`
        try {
            return await ky
                .post(url, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { role },
                })
                .json<GroupMember>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to change role")
        }
    }

    async sendGroupMessage(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        mlsCiphertext: string,
        replyToId?: string,
        attachmentIds?: string[],
    ): Promise<DirectMessage> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/groups/${conversationId}/messages`
        const json: Record<string, unknown> = { mls_ciphertext: mlsCiphertext }
        if (replyToId) json.reply_to_id = replyToId
        if (attachmentIds && attachmentIds.length > 0) json.attachment_ids = attachmentIds
        try {
            return await ky
                .post(url, { headers: { Authorization: `Bearer ${accessToken}` }, json })
                .json<DirectMessage>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to send message")
        }
    }
}
