import type { PresenceSnapshotEntry } from "@/domain/models/presence"

export interface IPresencePort {
    /** Fetch current presence states for a set of canonical actor URIs. */
    getPresence(idpUrl: string, accessToken: string, actorUris: string[]): Promise<PresenceSnapshotEntry[]>
}
