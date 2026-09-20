import type { GroupMember, GroupRole, GroupView } from "../models/group"
import type { DirectMessage } from "../models/dm"

export const GROUP_PORT = "GROUP_PORT"

/** Group membership + roles (server-side); MLS key material is handled
 *  separately by IE2eePort after the group is created here. */
export interface IGroupPort {
    /** Create a group with the caller as admin and the given initial members. */
    createGroup(
        idpUrl: string,
        accessToken: string,
        name: string | null,
        memberActorUris: string[],
    ): Promise<GroupView>
    /** List a group's members with their roles. */
    listMembers(idpUrl: string, accessToken: string, conversationId: string): Promise<GroupMember[]>
    /** Add a member (admin only). Returns the new member row. */
    addMember(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        actorUri: string,
    ): Promise<GroupMember>
    /** Remove a member (admin only) or leave the group (target === caller). */
    removeMember(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        actorUri: string,
    ): Promise<void>
    /** Rename a group (admin only). */
    renameGroup(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        name: string,
    ): Promise<GroupView>
    /** Change a member's role (admin only). */
    setMemberRole(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        actorUri: string,
        role: GroupRole,
    ): Promise<GroupMember>
    /** Send a message to the group — the server fans the ciphertext out to every member. */
    sendGroupMessage(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        mlsCiphertext: string,
        replyToId?: string,
        attachmentIds?: string[],
    ): Promise<DirectMessage>
}
