import type { MakeWorld, StorageWorld } from "@pinai/crypto/contract/storage/world"
import type { ActorUri } from "@pinai/domain/models/e2ee"
import { accountStoreNames } from "@/adapters/storage/account-store-names"
import { KeystoreDeviceKeyAdapter } from "@/adapters/storage/keystore-device-key.adapter"
import { deleteSqliteDatabase, SqliteKeyValueStore } from "@/adapters/storage/sqlite-key-value-store.adapter"

/** A world whose stores can also be let go of without deleting them (the restart check keeps them across a restart). */
export interface CheckStores extends StorageWorld {
    close(): Promise<void>
}

/**
 * The development checks' stores: each account's database and key under `prefix`, never the app's own.
 * `dispose` closes and deletes them all.
 */
export function checkStores(prefix: string): CheckStores {
    const opened: { database: string; kv: SqliteKeyValueStore }[] = []
    const aliases = new Set<string>()
    const used = new Set<string>()

    async function close(): Promise<void> {
        for (const { database, kv } of opened.splice(0)) {
            if (await kv.close()) used.add(database)
        }
    }

    return {
        open(account: ActorUri) {
            const names = accountStoreNames(account)
            const database = `${prefix}-${names.database}`
            const alias = `${prefix}.${names.keyAlias}`
            const kv = new SqliteKeyValueStore(database)
            opened.push({ database, kv })
            aliases.add(alias)
            return { kv, deviceKey: new KeystoreDeviceKeyAdapter(alias) }
        },
        close,
        async dispose() {
            await close()
            for (const database of used) await deleteSqliteDatabase(database)
            used.clear()
            for (const alias of aliases) await new KeystoreDeviceKeyAdapter(alias).wipe()
            aliases.clear()
        },
    }
}

let worlds = 0

// Each scenario under a prefix of its own: what one leaves never reaches the next.
export const phoneStorageWorld: MakeWorld = async () => checkStores(`contract-${Date.now()}-${++worlds}`)
