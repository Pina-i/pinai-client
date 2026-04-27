import type { PresenceSnapshotEntry } from "@/domain/models/presence"

export interface IPresencePort {
    /** Fetch current presence states for a set of federated addresses (`username@domain`). */
    getPresence(idpUrl: string, accessToken: string, addresses: string[]): Promise<PresenceSnapshotEntry[]>
}
