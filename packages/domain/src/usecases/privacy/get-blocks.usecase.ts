import type { BlockedActorEntry } from "../../models/block"
import type { IPrivacyPort } from "../../ports/privacy.port"

export async function getBlocksUseCase(
    idpUrl: string,
    accessToken: string,
    port: IPrivacyPort,
): Promise<BlockedActorEntry[]> {
    return port.listBlocks(idpUrl, accessToken)
}
