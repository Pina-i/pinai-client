import type { ProfileCard } from "../../models/profile"
import type { IUserPort } from "../../ports/user.port"

export async function getProfileCardUseCase(
    idpUrl: string,
    accessToken: string,
    actorUri: string,
    userPort: IUserPort,
): Promise<ProfileCard | null> {
    const trimmed = actorUri.trim()
    if (!trimmed) throw new Error("Actor URI cannot be empty")

    return userPort.getProfileCard(idpUrl, accessToken, trimmed)
}
