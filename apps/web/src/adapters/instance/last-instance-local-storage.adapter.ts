import type { ILastInstancePort } from "@pinai/domain/ports/instance.port"

export const LAST_INSTANCE_KEY = "pinai.last-instance"

export class LastInstanceLocalStorageAdapter implements ILastInstancePort {
    read(): unknown {
        try {
            return localStorage.getItem(LAST_INSTANCE_KEY)
        } catch {
            // Blocked storage: nothing remembered.
            return null
        }
    }

    write(origin: string): void {
        try {
            localStorage.setItem(LAST_INSTANCE_KEY, origin)
        } catch {
            // Storage unavailable: the next visit starts empty.
        }
    }
}
