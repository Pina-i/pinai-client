/** The stores a scenario plays with: each account's own, as the app would open them. */

import type { ContractScenario } from "@pinai/domain/lib/contract"
import type { ActorUri } from "@pinai/domain/models/e2ee"
import { asActorUri } from "@pinai/domain/models/identity"
import type { IDeviceKeyPort } from "@pinai/domain/ports/device-key.port"
import type { IKeyValueStore } from "@pinai/domain/ports/key-value-store.port"
import { SealedStorage } from "../../sealed-storage"

export interface AccountStore {
    readonly kv: IKeyValueStore
    readonly deviceKey: IDeviceKeyPort
}

/**
 * A scenario's own stores, empty when made. Each `open` is a new instance of the app over `account`'s
 * store — a second tab, the app after a restart —: the same rows, the same key.
 */
export interface StorageWorld {
    open(account: ActorUri): AccountStore
    /** Deletes, or lets go of, every store and key this world opened. */
    dispose(): Promise<void>
}

export type MakeWorld = () => Promise<StorageWorld>

export type StorageScenario = ContractScenario<MakeWorld>

export const ALICE = asActorUri("https://idp.example/users/alice")
export const PIERRE = asActorUri("https://idp.example/users/pierre")

export function sealed(world: StorageWorld, account: ActorUri = ALICE): SealedStorage {
    const { kv, deviceKey } = world.open(account)
    return new SealedStorage(kv, deviceKey)
}

/** `body` in a fresh world, disposed of however it ends. */
export async function inWorld(make: MakeWorld, body: (world: StorageWorld) => Promise<void>): Promise<void> {
    const world = await make()
    try {
        await body(world)
    } finally {
        await world.dispose()
    }
}
