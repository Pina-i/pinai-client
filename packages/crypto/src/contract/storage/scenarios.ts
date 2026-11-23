/**
 * The storage contract: what every implementation of `IKeyValueStore` and `IDeviceKeyPort` does, with
 * `SealedStorage` over them. Played on IndexedDB + WebCrypto by the web's tests
 * (`apps/web/test/storage-contract.spec.ts`) and on SQLite + the Keystore on the phone. Plain
 * TypeScript, no test runner: a scenario throws when it fails.
 */

import { BYTE_STORE_SCENARIOS } from "./byte-store"
import { DEVICE_KEY_SCENARIOS } from "./device-key"
import { SEALED_STORAGE_SCENARIOS } from "./sealed-storage"
import type { StorageScenario } from "./world"

export const STORAGE_SCENARIOS: readonly StorageScenario[] = [...BYTE_STORE_SCENARIOS, ...DEVICE_KEY_SCENARIOS, ...SEALED_STORAGE_SCENARIOS]
