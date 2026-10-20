import type { HeldRefreshToken, ISessionTokenStore } from "@pinai/domain/ports/auth.port"

/**
 * {@link ISessionTokenStore} in this page's memory: never web storage, which any script on the
 * page could read, and never the persisted store. A reload loses it, and signs in again through
 * `/authorize`, which the IdP's session cookie makes silent.
 */
export class MemorySessionTokenStore implements ISessionTokenStore {
    private held: HeldRefreshToken | null = null

    set(held: HeldRefreshToken): void {
        this.held = held
    }

    take(): HeldRefreshToken | null {
        const held = this.held
        this.held = null
        return held
    }

    clear(): void {
        this.held = null
    }
}
