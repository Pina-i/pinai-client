import type { ActorUri } from "../models/e2ee"

/**
 * Which account's device storage this client has open.
 *
 * Device state — identity, MLS provider, attestation, the decrypted-message
 * cache — is kept per account, so two accounts signing in on one device each
 * keep their own rather than one erasing the other. Exactly one account's
 * storage is open at a time.
 */
export interface IAccountStoragePort {
    /** The account whose storage is open, or `null` before the first sign-in on this device. */
    openAccount(): ActorUri | null

    /**
     * Open `actorUri`'s storage in place of the current one. On the web the
     * storage is opened at page load, so this reloads the page and never
     * resolves.
     */
    switchTo(actorUri: ActorUri): Promise<void>
}
