import type { FollowResponse } from "@/domain/models/social"
import type { ISocialPort } from "@/domain/ports/social.port"

export async function sendFriendRequestUseCase(
    idpUrl: string,
    accessToken: string,
    address: string,
    socialPort: ISocialPort,
): Promise<FollowResponse> {
    const trimmed = address.trim()
    if (!trimmed) throw new Error("Address cannot be empty")

    return socialPort.sendFollowRequest(idpUrl, accessToken, trimmed)
}
