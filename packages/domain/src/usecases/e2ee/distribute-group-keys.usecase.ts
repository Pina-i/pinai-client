import { KeyPackageUnavailable } from "../../models/group"
import { asActorUri } from "../../models/identity"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IGroupPort } from "../../ports/group.port"

export interface KeyDistribution {
    /** Taken off the group again: their instance handed out no KeyPackage. */
    dropped: string[]
    /** Kept, though their keys failed past the claim. */
    failed: string[]
}

/**
 * Give each new member's devices the group's keys. One at a time: concurrent Add commits race the
 * epoch. Whoever's instance hands out no KeyPackage is taken off the group, so its roster stops
 * naming someone who could never read it; a later failure keeps the member, whom the group's MLS
 * state may already hold.
 */
export async function distributeGroupKeysUseCase(
    idpUrl: string,
    accessToken: string,
    conversationId: string,
    actorUris: readonly string[],
    e2ee: Pick<IE2eePort, "addContactToGroup">,
    groups: Pick<IGroupPort, "removeMember">,
): Promise<KeyDistribution> {
    const outcome: KeyDistribution = { dropped: [], failed: [] }
    for (const uri of actorUris) {
        try {
            await e2ee.addContactToGroup(idpUrl, accessToken, conversationId, asActorUri(uri))
        } catch (e) {
            if (!(e instanceof KeyPackageUnavailable)) {
                outcome.failed.push(uri)
                continue
            }
            outcome.dropped.push(uri)
            await groups.removeMember(idpUrl, accessToken, conversationId, uri).catch(() => {})
        }
    }
    return outcome
}
