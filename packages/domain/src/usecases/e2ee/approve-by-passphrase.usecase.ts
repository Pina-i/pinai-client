import type { ActorUri } from "../../models/e2ee"
import type { HistoryKeyStanding } from "../../models/history-key"
import { isDeviceRequired, isStaleHistoryKey, isUnreachable } from "../../models/idp-error"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"

import { shareOnceHeld, type ShareOnceHeldDeps } from "./share-history-key.usecase"

/**
 * A device that comes to hold the current passphrase approves itself with it, then reports the
 * generation (`identity-provider/specs/e2ee.md § 3.9`, § 6.4), from a session that named it. A
 * generation set meanwhile (`stale_history_key`) reads the key again: the standing answers.
 */
export function approveByPassphraseUseCase(deps: { e2eePort: IE2eePort; deviceDirectoryPort: IDeviceDirectoryPort }) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<HistoryKeyStanding> => {
        const approval = await deps.e2eePort.signPassphraseApproval(idpUrl, accessToken, actorUri)
        const { deviceId, generation } = approval
        try {
            await deps.deviceDirectoryPort.approveByPassphrase(idpUrl, accessToken, deviceId, generation, approval.signature)
            await deps.deviceDirectoryPort.reportHistoryKey(idpUrl, accessToken, deviceId, generation)
        } catch (error) {
            if (isStaleHistoryKey(error)) return deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
            throw error
        }
        await deps.e2eePort.recordPassphraseApproval(generation, approval.rootKey)
        return { kind: "holds", generation, settled: true }
    }
}

/**
 * `standing` holding the key in force without this device's approval by its words — a flow cut
 * short between keeping and approving, whose approval is best effort —: the approval made, then the
 * words shared with the partners waiting for them. Saving waits on it (`savesToArchive`).
 */
export async function approveHeldWords(
    deps: ShareOnceHeldDeps,
    idpUrl: string,
    accessToken: string,
    actorUri: ActorUri,
    standing: HistoryKeyStanding,
): Promise<HistoryKeyStanding> {
    if (standing.kind !== "holds" || standing.settled) return standing
    const approved = await approveByPassphraseUseCase(deps)(idpUrl, accessToken, actorUri)
    if (approved.kind === "holds") await shareOnceHeld(deps, idpUrl, accessToken, actorUri)
    return approved
}

/**
 * {@link approveHeldWords}, never thrown: a session not named yet or an instance out of reach waits
 * for the next try, anything else is reported. Answers `standing` when it didn't go.
 */
export async function tryApproveHeldWords(
    deps: ShareOnceHeldDeps,
    idpUrl: string,
    accessToken: string,
    actorUri: ActorUri,
    standing: HistoryKeyStanding,
): Promise<HistoryKeyStanding> {
    try {
        return await approveHeldWords(deps, idpUrl, accessToken, actorUri, standing)
    } catch (error) {
        if (!isDeviceRequired(error) && !isUnreachable(error)) deps.report?.("approving this device by its words", error)
        return standing
    }
}

/** A moment the last try may have failed for want of a network — the socket back —: the standing held, approved if it isn't. */
export function approveHeldWordsUseCase(deps: ShareOnceHeldDeps) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<HistoryKeyStanding> =>
        tryApproveHeldWords(deps, idpUrl, accessToken, actorUri, await deps.e2eePort.historyKeyStanding())
}
