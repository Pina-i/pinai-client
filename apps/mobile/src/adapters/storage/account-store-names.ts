import type { ActorUri } from "@pinai/domain/models/e2ee"

/**
 * Where an account's encrypted store lives on this phone: a database and a key of its own, as on the web —
 * `SealedStorage.clear()` wipes the key, which must not erase another account's store.
 */
export function accountStoreNames(account: ActorUri): { database: string; keyAlias: string } {
    const id = encodeURIComponent(account)
    return { database: `e2ee-${id}.db`, keyAlias: `pinai.device-key.${id}` }
}
