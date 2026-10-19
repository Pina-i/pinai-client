import type { IRecentInstancesPort } from "@pinai/domain/ports/instance.port"

export const RECENT_INSTANCES_KEY = "pinai.recent-instances"

export class RecentInstancesLocalStorageAdapter implements IRecentInstancesPort {
    read(): unknown {
        try {
            const stored = localStorage.getItem(RECENT_INSTANCES_KEY)
            return stored ? JSON.parse(stored) : null
        } catch {
            // Blocked storage, or a value that isn't JSON: no recent instances.
            return null
        }
    }

    write(origins: string[]): void {
        try {
            localStorage.setItem(RECENT_INSTANCES_KEY, JSON.stringify(origins))
        } catch {
            // Storage unavailable: the list lasts until the page closes.
        }
    }
}
