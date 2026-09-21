/**
 * A durable store of opaque byte blobs, grouped into named collections.
 *
 * Deliberately the smallest thing that can carry the E2EE store: bytes in,
 * bytes out. Everything it holds is already sealed by {@link IDeviceKeyPort},
 * so it never sees plaintext and never needs to understand a schema.
 *
 * Bytes rather than arbitrary values because that is the intersection of what
 * the plausible backends can hold. IndexedDB structured-clones anything,
 * including a `CryptoKey`; SQLite has TEXT and BLOB; MMKV has strings,
 * numbers and buffers. A port promising more than bytes would be a port only
 * IndexedDB could implement — and the device key, which genuinely cannot be
 * expressed as bytes, is why {@link IDeviceKeyPort} exists separately rather
 * than being another row in here.
 *
 * Asynchronous throughout for the same reason the MLS engine is: IndexedDB
 * and SQLite are async, MMKV is not, and async is the shape that wraps both.
 *
 * `collection` and `key` are plain strings so a backend can map them however
 * it likes — object stores on the web, tables or key prefixes elsewhere.
 */
export interface IKeyValueStore {
    get(collection: string, key: string): Promise<Uint8Array | undefined>
    put(collection: string, key: string, value: Uint8Array): Promise<void>
    delete(collection: string, key: string): Promise<void>
    /** Drop every row in every collection this store owns. */
    clear(): Promise<void>
}
