import type { ActorUri } from "../../models/e2ee"
import type { IAccountStoragePort } from "../../ports/account-storage.port"

export interface OpenAccountStorageDeps {
    accountStoragePort: IAccountStoragePort
}

/** Runs before anything touches device storage, so it never serves another account's state. */
export const openAccountStorageUseCase =
    ({ accountStoragePort }: OpenAccountStorageDeps) =>
    async (actorUri: ActorUri): Promise<void> => {
        if (accountStoragePort.openAccount() === actorUri) return
        await accountStoragePort.switchTo(actorUri)
    }
