import type { DeviceListEntry } from "../../models/device"
import type { ActorUri, DeviceId } from "../../models/e2ee"
import { shareRefusal } from "../../models/key-share"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IKeySharePort } from "../../ports/key-share.port"

export interface ShareHistoryKeyDeps {
    e2ee: Pick<IE2eePort, "sealHistoryShares" | "forgoHistoryShare" | "checkHistoryKey">
    keyShares: IKeySharePort
    deviceDirectory: Pick<IDeviceDirectoryPort, "listDevices">
}

/** `forgone`: refused for good, never sent again under that generation; `failed`: sent again at the next refresh. */
export type HistoryKeySharing = {
    shared: DeviceId[]
    forgone: DeviceId[]
    failed: Array<{ deviceId: DeviceId; error: unknown }>
}

/**
 * The sender's side of `identity-provider/specs/e2ee.md § 3.11`: the passphrase this device holds,
 * to each handshake partner the list shows waiting for it — `devices` when a review just read the
 * list, else read here. Each share goes out once a call: one refused for good is never sent again,
 * one that may pass waits for the next refresh, and `stale_history_key` reads the key again and
 * sends nothing more.
 */
export function shareHistoryKeyUseCase(deps: ShareHistoryKeyDeps) {
    return async (
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        devices?: readonly DeviceListEntry[],
    ): Promise<HistoryKeySharing> => {
        const listed = devices ?? (await deps.deviceDirectory.listDevices(idpUrl, accessToken)).devices
        const outcome: HistoryKeySharing = { shared: [], forgone: [], failed: [] }
        for (const share of await deps.e2ee.sealHistoryShares(actorUri, listed)) {
            const deviceId = share.recipientDeviceId
            try {
                await deps.keyShares.share(idpUrl, accessToken, share)
                outcome.shared.push(deviceId)
            } catch (error) {
                const meaning = shareRefusal(error)
                if (meaning === "final") {
                    deps.e2ee.forgoHistoryShare(deviceId, share.generation)
                    outcome.forgone.push(deviceId)
                    continue
                }
                outcome.failed.push({ deviceId, error })
                if (meaning === "stale") {
                    await deps.e2ee.checkHistoryKey(idpUrl, accessToken)
                    break
                }
            }
        }
        return outcome
    }
}

export interface ShareOnceHeldDeps {
    e2eePort: IE2eePort
    deviceDirectoryPort: IDeviceDirectoryPort
    /** Unwired, nothing is shared. */
    keySharePort?: IKeySharePort
    /** Told what didn't go out; the domain logs nothing itself. */
    report?: (what: string, error: unknown) => void
}

/** A device that has just come to hold a generation shares it with the partners waiting for it. */
export async function shareOnceHeld(deps: ShareOnceHeldDeps, idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<void> {
    if (!deps.keySharePort) return
    const sharing = { e2ee: deps.e2eePort, keyShares: deps.keySharePort, deviceDirectory: deps.deviceDirectoryPort }
    try {
        const { failed } = await shareHistoryKeyUseCase(sharing)(idpUrl, accessToken, actorUri)
        for (const { error } of failed) deps.report?.("sharing the history passphrase", error)
    } catch (error) {
        deps.report?.("sharing the history passphrase", error)
    }
}
