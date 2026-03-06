import type { FollowResponse } from "@/domain/models/social"
import type { ISocialPort } from "@/domain/ports/social.port"

export async function sendFriendRequestUseCase(
    idpUrl: string,
    accessToken: string,
    handle: string,
    socialPort: ISocialPort,
): Promise<FollowResponse> {
    const trimmed = handle.trim()
    if (!trimmed) throw new Error("Handle cannot be empty")

    return socialPort.sendFollowRequest(idpUrl, accessToken, trimmed)
}
