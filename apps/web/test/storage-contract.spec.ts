/**
 * The storage contract (`@pinai/crypto/contract/storage`) on the web's stores: an IndexedDB database
 * per account, the WebCrypto key inside it. `fake-indexeddb` stands in for IndexedDB (jsdom has none).
 */
import { describe, it } from "vitest"
import "fake-indexeddb/auto"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import { IdbKeyValueStore, e2eeDatabaseName } from "@/adapters/storage/idb-key-value-store.adapter"
import { STORAGE_SCENARIOS } from "@pinai/crypto/contract/storage/scenarios"
import type { MakeWorld } from "@pinai/crypto/contract/storage/world"
import type { ActorUri } from "@pinai/domain/models/e2ee"

let worlds = 0

// Each world under names of its own: what one scenario leaves never reaches the next.
const webWorld: MakeWorld = async () => {
    const prefix = `contract-${++worlds}:`
    const opened: IdbKeyValueStore[] = []
    return {
        open(account: ActorUri) {
            const kv = new IdbKeyValueStore(prefix + e2eeDatabaseName(account))
            opened.push(kv)
            return { kv, deviceKey: new WebCryptoDeviceKeyAdapter(kv) }
        },
        async dispose() {
            for (const kv of opened) kv.close()
        },
    }
}

describe("the storage contract, on IndexedDB and WebCrypto", () => {
    for (const scenario of STORAGE_SCENARIOS) {
        it(scenario.name, () => scenario.run(webWorld))
    }
})
