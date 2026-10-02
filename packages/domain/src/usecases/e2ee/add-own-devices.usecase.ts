import type { DeviceListEntry } from "../../models/device"
import type { ConversationId, DeviceId } from "../../models/e2ee"
import type { IE2eePort } from "../../ports/e2ee.port"

/**
 * Bring the user's other active devices into each conversation this device holds keys for, one
 * at a time — see `identity-provider/specs/e2ee.md § 6.2`. A conversation that fails is left for
 * the next run, and named.
 */
export async function addOwnDevicesUseCase(
    idpUrl: string,
    accessToken: string,
    thisDevice: DeviceId,
    devices: readonly Pick<DeviceListEntry, "device_id" | "revoked_at">[],
    conversationIds: readonly ConversationId[],
    e2ee: Pick<IE2eePort, "addOwnDevices">,
): Promise<{ added: number; failed: { conversationId: ConversationId; error: unknown }[] }> {
    const others = devices
        .filter((d) => d.device_id !== thisDevice && d.revoked_at == null)
        .map((d) => d.device_id)
    let added = 0
    const failed: { conversationId: ConversationId; error: unknown }[] = []
    if (others.length === 0) return { added, failed }
    for (const conversationId of conversationIds) {
        try {
            added += (await e2ee.addOwnDevices(idpUrl, accessToken, conversationId, others)).added
        } catch (error) {
            failed.push({ conversationId, error })
        }
    }
    return { added, failed }
}
