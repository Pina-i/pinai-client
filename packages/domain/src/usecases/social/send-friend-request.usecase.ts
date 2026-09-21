import type { FriendRequestResponse } from "../../models/social"
import type { ISocialPort } from "../../ports/social.port"

export async function sendFriendRequestUseCase(
    idpUrl: string,
    accessToken: string,
    address: string,
    socialPort: ISocialPort,
): Promise<FriendRequestResponse> {
    const trimmed = address.trim()
    if (!trimmed) throw new Error("Address cannot be empty")

    return socialPort.sendFriendRequest(idpUrl, accessToken, trimmed)
}
