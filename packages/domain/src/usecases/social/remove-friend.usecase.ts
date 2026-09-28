import type { ISocialPort } from "../../ports/social.port"

export async function removeFriendUseCase(
    idpUrl: string,
    accessToken: string,
    friendActorUri: string,
    socialPort: ISocialPort,
): Promise<void> {
    const trimmed = friendActorUri.trim()
    if (!trimmed) throw new Error("Friend actor URI cannot be empty")

    return socialPort.removeFriend(idpUrl, accessToken, trimmed)
}
