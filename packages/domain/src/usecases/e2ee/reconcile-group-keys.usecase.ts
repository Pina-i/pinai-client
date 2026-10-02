import type { IE2eePort } from "../../ports/e2ee.port"
import type { IGroupPort } from "../../ports/group.port"

/**
 * Bring a group's MLS state in line with its roster: someone who left can't commit their own
 * devices out, and a removal can stop short of its commits. Admins do it — fewer clients racing
 * for the same epoch; another member's client leaves it to them.
 */
export async function reconcileGroupKeysUseCase(
    idpUrl: string,
    accessToken: string,
    conversationId: string,
    me: string,
    groups: Pick<IGroupPort, "listMembers">,
    e2ee: Pick<IE2eePort, "pruneGroup">,
): Promise<{ removed: number }> {
    const roster = await groups.listMembers(idpUrl, accessToken, conversationId)
    if (!roster.some((m) => m.actorUri === me && m.role === "admin")) return { removed: 0 }
    return e2ee.pruneGroup(
        idpUrl,
        accessToken,
        conversationId,
        roster.map((m) => m.actorUri),
    )
}
