import type { AuthSessionKey, IAuthSessionStore } from "@pinai/domain/ports/auth.port"

/**
 * {@link IAuthSessionStore} in memory: the app lives through the hand-off to the IdP, and nothing
 * of a sign-in under way — the PKCE verifier above all — is written to the phone. Android killing
 * the app meanwhile loses it: the callback then says the sign-in was interrupted.
 */
export class MemoryAuthSessionStore implements IAuthSessionStore {
    private readonly values = new Map<AuthSessionKey, string>()

    get(key: AuthSessionKey): string | null {
        return this.values.get(key) ?? null
    }

    set(key: AuthSessionKey, value: string): void {
        this.values.set(key, value)
    }

    remove(key: AuthSessionKey): void {
        this.values.delete(key)
    }

    clear(): void {
        this.values.clear()
    }
}
