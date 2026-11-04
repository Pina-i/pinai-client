import type { ActorUri } from "../../models/e2ee"
import { isDeviceMismatch } from "../../models/idp-error"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"
import type { IKeySharePort } from "../../ports/key-share.port"
import type { ISessionPort } from "../../ports/session.port"

import { linkSessionDeviceUseCase } from "../auth/link-session-device.usecase"
import { checkHistoryKeyUseCase } from "./check-history-key.usecase"

/**
 * Once per page load: the session names its device, then the device's words are checked against
 * the history key — never before, as settling a pending key, approving and reporting take the
 * naming. A failed check is answered as `historyKeyFailure`; `device_mismatch` is thrown.
 */
export function startThisDeviceUseCase(deps: {
    sessionPort: ISessionPort
    e2eePort: IE2eePort
    historyArchivePort: IHistoryArchivePort
    deviceDirectoryPort: IDeviceDirectoryPort
    keySharePort?: IKeySharePort
    report?: (what: string, error: unknown) => void
}) {
    return async (
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ linked: boolean; registrationFailure?: unknown; historyKeyFailure?: unknown }> => {
        const link = await linkSessionDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
        if (!link.linked) return link
        try {
            await checkHistoryKeyUseCase(deps)(idpUrl, accessToken, actorUri)
            return link
        } catch (historyKeyFailure) {
            if (isDeviceMismatch(historyKeyFailure)) throw historyKeyFailure
            return { ...link, historyKeyFailure }
        }
    }
}
