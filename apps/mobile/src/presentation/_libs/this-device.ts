import type { ActorUri } from "@pinai/domain/models/e2ee"
import { startThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/start-this-device.usecase"
import { ThisDeviceStart } from "@pinai/domain/usecases/e2ee/this-device-start.usecase"
import {
    getDeviceDirectoryPort,
    getE2eePort,
    getHistoryArchivePort,
    getKeySharePort,
    getPendingKeyLock,
    getSessionPort,
    openAccountE2ee,
} from "@/ioc"
import { useAppStore } from "@/store/store"
import { signInAgainOnDeviceMismatch } from "./device-mismatch"
import { warnE2ee } from "./warn-e2ee"

const starts = new Map<ActorUri, ThisDeviceStart>()

/**
 * The signed-in account's E2EE core opened, then the device started (`ThisDeviceStart`: once settled, a run;
 * tried again at the next call while the IdP is out of reach). Idempotent: every signed-in screen calls it.
 */
export function enterAccount(actorUri: ActorUri): void {
    openAccountE2ee(actorUri)
    let start = starts.get(actorUri)
    if (!start) {
        start = new ThisDeviceStart({
            start: (idpUrl, accessToken, actor) =>
                startThisDeviceUseCase({
                    sessionPort: getSessionPort(),
                    e2eePort: getE2eePort(),
                    historyArchivePort: getHistoryArchivePort(),
                    deviceDirectoryPort: getDeviceDirectoryPort(),
                    keySharePort: getKeySharePort(),
                    report: warnE2ee,
                    pendingKeyLock: getPendingKeyLock(),
                })(idpUrl, accessToken, actor),
            session: () => {
                const { idpUrl, accessToken, user } = useAppStore.getState()
                return idpUrl && accessToken && user?.actor_uri === actorUri ? { idpUrl, accessToken, actorUri } : null
            },
            signInAgainOnDeviceMismatch,
            warn: warnE2ee,
        })
        starts.set(actorUri, start)
    }
    void start.run()
}
