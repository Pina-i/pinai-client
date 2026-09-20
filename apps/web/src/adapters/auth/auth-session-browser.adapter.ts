import { AUTH_SESSION_KEYS, type AuthSessionKey, type IAuthSessionStore } from "@pinai/domain/ports/auth.port"

/**
 * `sessionStorage` implementation of {@link IAuthSessionStore}.
 *
 * Chosen over `localStorage` on purpose: the PKCE verifier is single-use and
 * must not outlive the tab. Nothing here is an access token — those never
 * touch web storage (see the security constraints in CLAUDE.md).
 */
export class BrowserAuthSessionStore implements IAuthSessionStore {
    get(key: AuthSessionKey): string | null {
        return sessionStorage.getItem(key)
    }

    set(key: AuthSessionKey, value: string): void {
        sessionStorage.setItem(key, value)
    }

    remove(key: AuthSessionKey): void {
        sessionStorage.removeItem(key)
    }

    clear(): void {
        for (const key of AUTH_SESSION_KEYS) sessionStorage.removeItem(key)
    }
}
