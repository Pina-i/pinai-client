import type { AcceptHistoryShareDeps } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import type { ShareHistoryKeyDeps } from "@pinai/domain/usecases/e2ee/share-history-key.usecase"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getKeySharePort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"

/** What sharing the passphrase with the partners waiting for it reads and calls. */
export function shareDeps(): ShareHistoryKeyDeps {
    return { e2ee: getE2eePort(), keyShares: getKeySharePort(), deviceDirectory: getDeviceDirectoryPort() }
}

export function warnE2ee(what: string, error: unknown): void {
    // eslint-disable-next-line no-console
    console.warn(`[e2ee] ${what}`, error instanceof Error ? error.message : error)
}

/** {@link warnE2ee} as a `catch` handler. */
export function warnOf(what: string): (error: unknown) => void {
    return (error) => warnE2ee(what, error)
}

/** What taking the share waiting for this device reads and calls; a share it can't pass on is warned of. */
export function acceptShareDeps(): AcceptHistoryShareDeps {
    return { ...admissionDeps(), historyArchivePort: getHistoryArchivePort(), keySharePort: getKeySharePort(), report: warnE2ee }
}
