import type { UserSummary } from "@/domain/models/social"
import type { ISocialPort } from "@/domain/ports/social.port"

export async function getFriendsUseCase(
    idpUrl: string,
    accessToken: string,
    port: ISocialPort,
): Promise<UserSummary[]> {
    return port.getFriends(idpUrl, accessToken)
}
