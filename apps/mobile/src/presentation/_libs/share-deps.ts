import type { ShareHistoryKeyDeps } from "@pinai/domain/usecases/e2ee/share-history-key.usecase"
import { getDeviceDirectoryPort, getE2eePort, getKeySharePort } from "@/ioc"

/** What sharing the passphrase with the partners waiting for it reads and calls. */
export function shareDeps(): ShareHistoryKeyDeps {
    return { e2ee: getE2eePort(), keyShares: getKeySharePort(), deviceDirectory: getDeviceDirectoryPort() }
}
