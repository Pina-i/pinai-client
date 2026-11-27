import type { DeviceId } from "@pinai/domain/models/e2ee"
import { revokeDeviceUseCase } from "@pinai/domain/usecases/e2ee/revoke-device.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { listedConversationIds, reviewDevices } from "./device-review"
import { warnE2ee } from "./warn-e2ee"

/**
 * Signs a device out of the account for good (revoked: it reads nothing new), committed out of the conversations held;
 * the list is reviewed again, which closes the device's requests in the seats and the Door.
 */
export async function signOutDevice(deviceId: DeviceId): Promise<void> {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return
    await revokeDeviceUseCase({ e2eePort: getE2eePort(), deviceDirectoryPort: getDeviceDirectoryPort() })({
        idpUrl,
        accessToken,
        actorUri: user.actor_uri,
        deviceId,
        conversationIds: listedConversationIds(),
    })
    reviewDevices().catch((error: unknown) => warnE2ee("reviewing the device list", error))
}
