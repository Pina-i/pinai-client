import type { PresenceSnapshotEntry } from "@/domain/models/presence"
import type { IPresencePort } from "@/domain/ports/presence.port"

export async function getPresenceSnapshotUseCase(
    idpUrl: string,
    accessToken: string,
    actorUris: string[],
    port: IPresencePort,
): Promise<PresenceSnapshotEntry[]> {
    return port.getPresence(idpUrl, accessToken, actorUris)
}
