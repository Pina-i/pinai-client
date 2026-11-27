import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite"
import type { ListingKeyValueStore } from "./sealed-conversation-cache.adapter"

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS rows (
    collection TEXT NOT NULL,
    key TEXT NOT NULL,
    value BLOB NOT NULL,
    PRIMARY KEY (collection, key)
) WITHOUT ROWID;
`

/** The encrypted store's bytes in a SQLite database of the account's own: one table, every collection in it. */
export class SqliteKeyValueStore implements ListingKeyValueStore {
    private readonly name: string
    #db: Promise<SQLiteDatabase> | null = null

    constructor(name: string) {
        this.name = name
    }

    // Opened on first use; a failed open is tried again on the next call.
    #open(): Promise<SQLiteDatabase> {
        this.#db ??= openDatabaseAsync(this.name)
            .then(async (db) => {
                await db.execAsync(SCHEMA)
                return db
            })
            .catch((e: unknown) => {
                this.#db = null
                throw e
            })
        return this.#db
    }

    async get(collection: string, key: string): Promise<Uint8Array | undefined> {
        const db = await this.#open()
        const row = await db.getFirstAsync<{ value: Uint8Array }>("SELECT value FROM rows WHERE collection = ? AND key = ?", collection, key)
        return row?.value
    }

    async put(collection: string, key: string, value: Uint8Array): Promise<void> {
        const db = await this.#open()
        await db.runAsync(
            "INSERT INTO rows (collection, key, value) VALUES (?, ?, ?) ON CONFLICT (collection, key) DO UPDATE SET value = excluded.value",
            collection,
            key,
            value
        )
    }

    async keys(collection: string): Promise<string[]> {
        const db = await this.#open()
        const rows = await db.getAllAsync<{ key: string }>("SELECT key FROM rows WHERE collection = ?", collection)
        return rows.map((row) => row.key)
    }

    async delete(collection: string, key: string): Promise<void> {
        const db = await this.#open()
        await db.runAsync("DELETE FROM rows WHERE collection = ? AND key = ?", collection, key)
    }

    async clear(): Promise<void> {
        const db = await this.#open()
        await db.runAsync("DELETE FROM rows")
    }

    /** Lets go of the connection; `true` when one was open. */
    async close(): Promise<boolean> {
        const opening = this.#db
        this.#db = null
        if (!opening) return false
        await (await opening).closeAsync()
        return true
    }
}

/** expo-sqlite refuses while any store over the file is still open: close them all first. */
export function deleteSqliteDatabase(name: string): Promise<void> {
    return deleteDatabaseAsync(name)
}
