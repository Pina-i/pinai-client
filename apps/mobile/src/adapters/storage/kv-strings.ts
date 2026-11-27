import Storage from "expo-sqlite/kv-store"
import type { StringStore } from "@pinai/api/e2ee/jwks-cache.adapter"

/** The kv-store's synchronous half, as the shared caches keep strings. */
export const kvStrings: StringStore = {
    getItem: (key) => Storage.getItemSync(key),
    setItem: (key, value) => Storage.setItemSync(key, value),
    removeItem: (key) => void Storage.removeItemSync(key),
}
