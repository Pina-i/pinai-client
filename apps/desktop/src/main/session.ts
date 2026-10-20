import { readFile, rm, writeFile } from "fs/promises"

import type { HeldRefreshToken, IAuthPort, ISessionTokenStore } from "@pinai/domain/ports/auth.port"
import { type Renewal, renewSessionUseCase } from "@pinai/domain/usecases/auth/renew-session.usecase"
import { safeStorage } from "electron"

/** Electron's `safeStorage`, as far as this store needs it. */
export interface Sealer {
    /** Backed by the OS keychain: macOS Keychain, Windows DPAPI, the Secret Service or KWallet on Linux. */
    secure(): Promise<boolean>
    seal(plain: string): Promise<Buffer>
    open(sealed: Buffer): Promise<string>
}

let secure: Promise<boolean> | null = null

export const keychain: Sealer = {
    // Linux reads the keyring's key after `ready`: a moment's wait before taking a no for an answer,
    // once. (The async API waits on the XDG portal, which may never answer.) Without a keyring,
    // Chromium falls back to a fixed key on Linux: as good as plain text.
    secure: () =>
        (secure ??= (async () => {
            for (let waited = 0; !safeStorage.isEncryptionAvailable() && waited < 5000; waited += 100) {
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
            return (
                safeStorage.isEncryptionAvailable() &&
                !(process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
            )
        })()),
    seal: async (plain) => safeStorage.encryptString(plain),
    open: async (sealed) => safeStorage.decryptString(sealed),
}

/**
 * The refresh token, sealed with the OS keychain into a file of the app's own: it survives a
 * restart, and the page never reads it. Without a keychain it is kept in memory only, and each
 * launch signs in again. Reads and writes go to the file in the background, in order; `load`
 * comes first.
 */
export class KeychainSessionTokenStore implements ISessionTokenStore {
    private readonly file: string
    private readonly sealer: Sealer
    private held: HeldRefreshToken | null = null
    private loading: Promise<void> | null = null
    private writing: Promise<void> = Promise.resolve()

    constructor(file: string, sealer: Sealer) {
        this.file = file
        this.sealer = sealer
    }

    /** The token a previous launch kept, once. */
    load(): Promise<void> {
        this.loading ??= (async () => {
            if (!(await this.sealer.secure())) return
            const sealed = await readFile(this.file).catch(() => null)
            if (!sealed) return
            try {
                this.held ??= JSON.parse(await this.sealer.open(sealed)) as HeldRefreshToken
            } catch {
                // Sealed under another key, or damaged: nothing to pick up.
            }
        })()
        return this.loading
    }

    holds(): boolean {
        return this.held !== null
    }

    set(held: HeldRefreshToken): void {
        this.held = held
        this.queue(async () => {
            if (await this.sealer.secure()) await writeFile(this.file, await this.sealer.seal(JSON.stringify(held)), { mode: 0o600 })
        })
    }

    /** Taken from memory; the file keeps it until the next one is set, so a crash mid-renewal loses nothing. */
    take(): HeldRefreshToken | null {
        const held = this.held
        this.held = null
        return held
    }

    clear(): void {
        this.held = null
        this.queue(() => rm(this.file, { force: true }))
    }

    /** Settles once every write queued so far is on disk. */
    flushed(): Promise<void> {
        return this.writing
    }

    private queue(write: () => Promise<void>): void {
        this.writing = this.writing.then(write).catch((error: unknown) => {
            // eslint-disable-next-line no-console
            console.warn("Keeping the session on disk failed", error)
        })
    }
}

/** The app's session as the main process runs it: renewals one at a time, and the sign-out. */
export class MainSession {
    private readonly store: KeychainSessionTokenStore
    private readonly oidc: IAuthPort
    private readonly renewer: () => Promise<Renewal>
    private renewing: Promise<Renewal> | null = null

    constructor(store: KeychainSessionTokenStore, oidc: IAuthPort) {
        this.store = store
        this.oidc = oidc
        this.renewer = renewSessionUseCase(oidc, store)
    }

    /** The refresh token the page hands over once, after the code exchange. */
    hold(held: HeldRefreshToken): Promise<void> {
        this.store.set(held)
        return this.store.flushed()
    }

    async renew(): Promise<Renewal> {
        await this.store.load()
        const held = this.store.holds()
        this.renewing = this.renewer()
        const renewal = await this.renewing
        // Refused by the IdP: the session is over, and the token kept for it with it. Nothing held
        // is not a refusal: a keychain out of reach this launch leaves the file for the next.
        if (renewal.kind === "ended" && held) this.store.clear()
        return renewal
    }

    /** Revokes the refresh token at the IdP — the app's session ends there — and forgets it. */
    async signOut(): Promise<void> {
        await this.renewing?.catch(() => undefined)
        await this.store.load()
        const held = this.store.take()
        this.store.clear()
        await this.store.flushed()
        if (!held?.revocationEndpoint) return
        await this.oidc
            .revoke({ revocationEndpoint: held.revocationEndpoint, clientId: held.clientId, refreshToken: held.refreshToken })
            // Signed out here all the same; the session idles out at the IdP within 90 days.
            // eslint-disable-next-line no-console
            .catch((error: unknown) => console.warn("Revoking the refresh token failed", error))
    }
}
