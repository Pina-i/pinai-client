import type { DeviceListEntry } from "../../models/device"
import type { ConversationId, DeviceId } from "../../models/e2ee"
import type { IE2eePort } from "../../ports/e2ee.port"

/**
 * Keep each conversation this device holds keys for in step, one at a time: the commits it
 * missed, its own leaf's credential made current, then the user's other active devices it lacks —
 * see `identity-provider/specs/e2ee.md § 6.2`. Each step that fails is named with its
 * conversation and left for the next run; one that failed to catch up goes no further.
 */
export async function syncOwnGroupsUseCase(
    idpUrl: string,
    accessToken: string,
    thisDevice: DeviceId,
    devices: readonly Pick<DeviceListEntry, "device_id" | "revoked_at">[],
    conversationIds: readonly ConversationId[],
    e2ee: Pick<IE2eePort, "addOwnDevices" | "catchUp" | "refreshOwnLeaf">,
): Promise<{ added: number; failed: { conversationId: ConversationId; error: unknown }[] }> {
    const others = devices
        .filter((d) => d.device_id !== thisDevice && d.revoked_at == null)
        .map((d) => d.device_id)
    let added = 0
    const failed: { conversationId: ConversationId; error: unknown }[] = []
    for (const conversationId of conversationIds) {
        try {
            await e2ee.catchUp(idpUrl, accessToken, conversationId)
        } catch (error) {
            failed.push({ conversationId, error })
            continue
        }
        // A leaf left as it was keeps nobody out: the siblings are added all the same.
        try {
            await e2ee.refreshOwnLeaf(idpUrl, accessToken, conversationId)
        } catch (error) {
            failed.push({ conversationId, error })
        }
        if (others.length === 0) continue
        try {
            added += (await e2ee.addOwnDevices(idpUrl, accessToken, conversationId, others)).added
        } catch (error) {
            failed.push({ conversationId, error })
        }
    }
    return { added, failed }
}
