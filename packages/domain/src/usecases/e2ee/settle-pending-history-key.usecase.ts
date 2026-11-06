import { FIRST_HISTORY_GENERATION, settlePending } from "../../models/history-key"
import { isHistoryKeyConflict } from "../../models/idp-error"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"

import { takeDeviceBaseline, type DeviceBaselineDeps } from "./take-device-baseline.usecase"

/**
 * Held across the account's tabs for as long as `run` runs, the others waiting; where the platform
 * has no such lock, the page's own turn is all there is.
 */
export type PendingKeyLock = <T>(run: () => Promise<T>) => Promise<T>

export interface PendingKeyDeps {
    e2eePort: IE2eePort
    pendingKeyLock?: PendingKeyLock
}

const lastTurn = new WeakMap<IE2eePort, Promise<unknown>>()

/**
 * One flow at a time writes, sends or settles a device's pending key — this page's in turn, then
 * the account's tabs under `pendingKeyLock`: a start over's key is pending while its `PUT` is out,
 * and a settle then would erase words the IdP may be taking.
 */
export function pendingKeyTurn<T>(deps: PendingKeyDeps, run: () => Promise<T>): Promise<T> {
    const locked = () => (deps.pendingKeyLock ? deps.pendingKeyLock(run) : run())
    const mine = (lastTurn.get(deps.e2eePort) ?? Promise.resolve()).then(locked, locked)
    lastTurn.set(deps.e2eePort, mine.catch(() => undefined))
    return mine
}

/**
 * A pending key is settled before anything else (`settlePending`): the key in force is it, so its
 * words are kept — a later generation's shown as new words, a start over's whose answer was lost,
 * its baseline taken as the flow would have —; a first generation with no key in force is set
 * again; a row written moments ago is left for a later settle; anything else is erased. From a
 * session that named its device.
 */
export function settlePendingHistoryKeyUseCase(
    deps: PendingKeyDeps & { historyArchivePort: IHistoryArchivePort; deviceDirectoryPort?: IDeviceDirectoryPort; report?: DeviceBaselineDeps["report"] },
) {
    return async (idpUrl: string, accessToken: string): Promise<void> => {
        const kept = await pendingKeyTurn(deps, async () => {
            const pending = await deps.e2eePort.pendingHistoryKey()
            if (!pending) return null
            const current = await deps.historyArchivePort.getKey(idpUrl, accessToken)
            const settlement = settlePending(pending, current)
            if (settlement === "leave") return null
            if (settlement === "erase") {
                await deps.e2eePort.dropPendingHistoryKey()
                return null
            }
            if (settlement === "send-again") {
                try {
                    await deps.historyArchivePort.setKey(idpUrl, accessToken, pending)
                } catch (error) {
                    if (isHistoryKeyConflict(error)) {
                        await deps.e2eePort.dropPendingHistoryKey()
                        return null
                    }
                    throw error
                }
            }
            await deps.e2eePort.promotePendingHistoryKey({ show: pending.generation > FIRST_HISTORY_GENERATION })
            return pending
        })
        if (kept?.intent && deps.deviceDirectoryPort) {
            await takeDeviceBaseline({ ...deps, deviceDirectoryPort: deps.deviceDirectoryPort }, idpUrl, accessToken, kept.generation, kept.intent)
        }
    }
}
