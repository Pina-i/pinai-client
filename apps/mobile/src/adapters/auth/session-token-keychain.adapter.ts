import type { HeldRefreshToken, IAuthPort, ISessionTokenStore } from "@pinai/domain/ports/auth.port"

const KEY = "pinai.refresh-token"

/** The keychain's synchronous half: `expo-secure-store`'s, the Android Keystore underneath. */
export interface SyncKeychain {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

/**
 * {@link ISessionTokenStore} in the keychain, so a restart picks the session up. Emptied by
 * writing nothing, synchronously: an asynchronous delete could land after the next token. Clearing
 * revokes the token it held, as the desktop's main process does — an app's session ends with its
 * refresh token.
 */
export class KeychainSessionTokenStore implements ISessionTokenStore {
    private readonly keychain: SyncKeychain
    private readonly authPort: IAuthPort
    // Read once; then what was set, should the keychain refuse a write.
    private held: HeldRefreshToken | null | undefined

    constructor(keychain: SyncKeychain, authPort: IAuthPort) {
        this.keychain = keychain
        this.authPort = authPort
    }

    set(held: HeldRefreshToken): void {
        this.held = held
        this.write(JSON.stringify(held))
    }

    take(): HeldRefreshToken | null {
        const held = this.held === undefined ? this.read() : this.held
        this.held = null
        this.write("")
        return held
    }

    clear(): void {
        const held = this.take()
        if (!held?.revocationEndpoint) return
        void this.authPort
            .revoke({ revocationEndpoint: held.revocationEndpoint, clientId: held.clientId, refreshToken: held.refreshToken })
            .catch(() => {
                // Out of reach: the session lapses after 90 days unused, as any the IdP never hears of again.
            })
    }

    private read(): HeldRefreshToken | null {
        try {
            return parseHeld(this.keychain.getItem(KEY))
        } catch {
            return null
        }
    }

    private write(value: string): void {
        try {
            this.keychain.setItem(KEY, value)
        } catch {
            // The keychain refused: the token lasts until the app closes.
        }
    }
}

function parseHeld(raw: string | null): HeldRefreshToken | null {
    if (!raw) return null
    try {
        const value = JSON.parse(raw) as Partial<HeldRefreshToken>
        const text = (field: unknown) => typeof field === "string" && field.length > 0
        if (!text(value.refreshToken) || !text(value.tokenEndpoint) || !text(value.clientId)) return null
        return {
            refreshToken: value.refreshToken!,
            tokenEndpoint: value.tokenEndpoint!,
            clientId: value.clientId!,
            revocationEndpoint: text(value.revocationEndpoint) ? value.revocationEndpoint! : null,
        }
    } catch {
        return null
    }
}
