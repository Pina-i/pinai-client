import type { IE2eePort } from "../../ports/e2ee.port"
import type { IGroupPort } from "../../ports/group.port"

/**
 * Take `actorUri` off a group, then commit their devices out of its MLS state for whoever is
 * left. The removal stands even when the keys can't follow at once (`cutOff: false`): an admin's
 * client finishes it on the next look at the group.
 */
export async function removeGroupMemberUseCase(
    idpUrl: string,
    accessToken: string,
    conversationId: string,
    actorUri: string,
    groups: Pick<IGroupPort, "removeMember" | "listMembers">,
    e2ee: Pick<IE2eePort, "pruneGroup">,
): Promise<{ cutOff: boolean }> {
    await groups.removeMember(idpUrl, accessToken, conversationId, actorUri)
    try {
        const roster = await groups.listMembers(idpUrl, accessToken, conversationId)
        await e2ee.pruneGroup(
            idpUrl,
            accessToken,
            conversationId,
            roster.map((m) => m.actorUri),
        )
        return { cutOff: true }
    } catch {
        return { cutOff: false }
    }
}
