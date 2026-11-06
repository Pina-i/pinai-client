import type { DeviceListEntry } from "../../models/device"
import type { DeviceTrustVerdict } from "../../models/device-trust"
import type { ActorUri, ConversationId, DeviceId } from "../../models/e2ee"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"

import { shareHistoryKeyUseCase, type ShareHistoryKeyDeps } from "./share-history-key.usecase"

type Failure = { conversationId: ConversationId; error: unknown }

/**
 * `unclaimed`: the approved siblings still missing from a group for want of a KeyPackage — to try
 * again. `shareFailure`: the shares that didn't go out (`HistoryKeySharing["failed"]`), or why none did.
 */
export type OwnGroupsSync = {
    added: number
    removed: number
    unclaimed: DeviceId[]
    failed: Failure[]
    reviewFailure?: unknown
    shareFailure?: unknown
}

export type OwnGroupsSyncDeps = {
    e2ee: Pick<IE2eePort, "catchUp" | "refreshOwnLeaf" | "reviewDevices" | "removeUntrustedLeaves" | "addOwnDevices">
    deviceDirectory: Pick<IDeviceDirectoryPort, "listDevices">
    /** Wired, an acting review shares the passphrase over the list it read (§ 3.11). */
    sharing?: ShareHistoryKeyDeps
}

/**
 * Keep each conversation this device holds keys for in step (`identity-provider/specs/e2ee.md
 * § 6.2`, § 3.9): every group caught up and its own leaf made current; then the device list read
 * again and reviewed, after the catch-ups, so a sibling's add they brought in is judged on a list
 * as new as it; then in each group the untrusted leaves committed out and the approved devices it
 * lacks added; then, acting, the passphrase shared with the partners that list shows waiting for
 * it. Each step that fails is named with its conversation and left for the next run; a group that
 * failed to catch up goes no further.
 */
export async function syncOwnGroupsUseCase(
    idpUrl: string,
    accessToken: string,
    actorUri: ActorUri,
    conversationIds: readonly ConversationId[],
    deps: OwnGroupsSyncDeps,
): Promise<OwnGroupsSync> {
    const { e2ee } = deps
    const failed: Failure[] = []
    const caughtUp: ConversationId[] = []
    for (const conversationId of conversationIds) {
        try {
            await e2ee.catchUp(idpUrl, accessToken, conversationId)
        } catch (error) {
            failed.push({ conversationId, error })
            continue
        }
        caughtUp.push(conversationId)
        // A leaf left as it was keeps nobody out: the siblings are added all the same.
        try {
            await e2ee.refreshOwnLeaf(idpUrl, accessToken, conversationId)
        } catch (error) {
            failed.push({ conversationId, error })
        }
    }

    const review = async (): Promise<{ devices: readonly DeviceListEntry[]; verdict: DeviceTrustVerdict }> => {
        const { devices } = await deps.deviceDirectory.listDevices(idpUrl, accessToken)
        return { devices, verdict: await e2ee.reviewDevices(idpUrl, accessToken, actorUri, devices) }
    }
    let trust: DeviceTrustVerdict | null = null
    let reviewed: readonly DeviceListEntry[] | null = null
    let reviewFailure: unknown = undefined
    try {
        ;({ verdict: trust, devices: reviewed } = await review())
    } catch (error) {
        reviewFailure = error
    }
    // Once a run, at the first own leaf it would commit out: `device_approved` may come after a sibling's add.
    let again: Promise<DeviceTrustVerdict | null> | null = null
    const reviewAgain = () =>
        (again ??= review().then(
            ({ verdict }) => (trust = verdict),
            (error: unknown) => {
                reviewFailure ??= error
                return (trust = null)
            },
        ))

    let added = 0
    let removed = 0
    const unclaimed = new Set<DeviceId>()
    for (const conversationId of caughtUp) {
        try {
            removed += (await e2ee.removeUntrustedLeaves(idpUrl, accessToken, conversationId, trust, reviewAgain)).removed
        } catch (error) {
            failed.push({ conversationId, error })
        }
        const now: DeviceTrustVerdict | null = trust
        if (!now?.acting) continue
        try {
            const outcome = await e2ee.addOwnDevices(idpUrl, accessToken, conversationId, now)
            added += outcome.added
            for (const deviceId of outcome.unclaimed) unclaimed.add(deviceId)
        } catch (error) {
            failed.push({ conversationId, error })
        }
    }
    let shareFailure: unknown = undefined
    const acted: DeviceTrustVerdict | null = trust
    if (deps.sharing && reviewed && acted?.acting) {
        try {
            const { failed: unsent } = await shareHistoryKeyUseCase(deps.sharing)(idpUrl, accessToken, actorUri, reviewed)
            if (unsent.length > 0) shareFailure = unsent
        } catch (error) {
            shareFailure = error
        }
    }
    const outcome: OwnGroupsSync = { added, removed, unclaimed: [...unclaimed], failed }
    if (reviewFailure !== undefined) outcome.reviewFailure = reviewFailure
    if (shareFailure !== undefined) outcome.shareFailure = shareFailure
    return outcome
}
