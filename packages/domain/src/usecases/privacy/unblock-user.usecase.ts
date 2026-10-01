import type { IPrivacyPort } from "../../ports/privacy.port"

export async function unblockUserUseCase(
    idpUrl: string,
    accessToken: string,
    actorUri: string,
    port: IPrivacyPort,
): Promise<void> {
    const trimmed = actorUri.trim()
    if (!trimmed) throw new Error("Actor URI cannot be empty")

    return port.unblock(idpUrl, accessToken, trimmed)
}
