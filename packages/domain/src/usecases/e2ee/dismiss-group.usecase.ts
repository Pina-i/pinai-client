import type { IE2eePort } from "../../ports/e2ee.port"
import type { IGroupPort } from "../../ports/group.port"

/**
 * Clear a group the user was removed from off their list, then drop its MLS state from this
 * device: nothing more will decrypt there, and being added again arrives as a new Welcome.
 */
export async function dismissGroupUseCase(
    idpUrl: string,
    accessToken: string,
    conversationId: string,
    groups: Pick<IGroupPort, "dismissGroup">,
    e2ee: Pick<IE2eePort, "forgetGroup">,
): Promise<void> {
    await groups.dismissGroup(idpUrl, accessToken, conversationId)
    await e2ee.forgetGroup(conversationId)
}
