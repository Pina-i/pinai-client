import type { PendingFriendRequest } from "../../models/social"
import type { ISocialPort } from "../../ports/social.port"

export async function getPendingFriendRequestsUseCase(
    idpUrl: string,
    accessToken: string,
    port: ISocialPort,
): Promise<PendingFriendRequest[]> {
    return port.getPendingFriendRequests(idpUrl, accessToken)
}
