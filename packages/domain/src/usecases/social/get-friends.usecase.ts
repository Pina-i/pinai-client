import type { FriendListEntry } from "../../models/social"
import type { ISocialPort } from "../../ports/social.port"

export async function getFriendsUseCase(
    idpUrl: string,
    accessToken: string,
    port: ISocialPort,
): Promise<FriendListEntry[]> {
    return port.getFriends(idpUrl, accessToken)
}
