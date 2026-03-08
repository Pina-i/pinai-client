import type { PendingFriendRequest } from "@/domain/models/social"
import type { ISocialPort } from "@/domain/ports/social.port"

export async function getPendingFriendRequestsUseCase(
    idpUrl: string,
    accessToken: string,
    port: ISocialPort,
): Promise<PendingFriendRequest[]> {
    return port.getPendingFriendRequests(idpUrl, accessToken)
}
