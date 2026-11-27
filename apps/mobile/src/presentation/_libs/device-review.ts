import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import type { ActorUri, ConversationId } from "@pinai/domain/models/e2ee"
import { DeviceFanout } from "@pinai/domain/usecases/e2ee/device-fanout.usecase"
import { syncOwnGroupsUseCase, type OwnGroupsSync } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { appVisibility } from "./app-visibility"
import { conversationList, onConversationList } from "./conversation-list"
import { shareDeps } from "./share-deps"
import { onSocketConnected, onSocketEvent } from "./socket"
import { warnE2ee } from "./warn-e2ee"

// One run at a time app-wide, whoever asks: the fanout, or a flow that changed the devices.
const syncInStep = oneAtATime((idpUrl: string, accessToken: string, actorUri: ActorUri, conversationIds: readonly ConversationId[]) =>
    syncOwnGroupsUseCase(idpUrl, accessToken, actorUri, conversationIds, {
        e2ee: getE2eePort(),
        deviceDirectory: getDeviceDirectoryPort(),
        sharing: shareDeps(),
    })
)

let runs = 0
// The last run's review or shares failed: the same list read again runs it again.
let unsettled = false

async function sync(idpUrl: string, accessToken: string, actorUri: ActorUri, conversationIds: readonly ConversationId[]): Promise<OwnGroupsSync> {
    runs++
    try {
        const outcome = await syncInStep(idpUrl, accessToken, actorUri, conversationIds)
        unsettled = outcome.reviewFailure !== undefined || outcome.shareFailure !== undefined
        return outcome
    } catch (error) {
        unsettled = true
        throw error
    }
}

/** The conversations the list holds: the groups a review keeps in step and a revocation commits out of. */
export function listedConversationIds(): ConversationId[] {
    return conversationList()?.rows.map((row) => row.id) ?? []
}

/**
 * The account's devices read and judged by this device now (`identity-provider/specs/e2ee.md § 3.9`), the groups held
 * kept in step with them: who arrived unapproved, who approved whom, the passphrase shared with a partner waiting for it.
 */
export async function reviewDevices(): Promise<void> {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return
    const { reviewFailure, shareFailure, failed } = await sync(idpUrl, accessToken, user.actor_uri, listedConversationIds())
    if (reviewFailure !== undefined) warnE2ee("reviewing the device list", reviewFailure)
    if (shareFailure !== undefined) warnE2ee("sharing the history passphrase; tried again at the next review", shareFailure)
    for (const { conversationId, error } of failed) warnE2ee(`keeping ${conversationId} in step`, error)
}

function review(): void {
    reviewDevices().catch((error: unknown) => warnE2ee("reviewing the device list", error))
}

/**
 * The domain's `DeviceFanout`: the device list read at start, on `device_joined` / `device_approved`, when the socket
 * or the app comes back and after a registration, a sync whenever what a review reads of it, the conversations or the
 * groups held changed. Without it the phone would announce nobody, share with nobody and bring no sibling in.
 */
export function keepDevicesInStep(): () => void {
    const { idpUrl, user } = useAppStore.getState()
    if (!idpUrl || !user) return () => undefined
    let live = true
    const readList = (): void => {
        const accessToken = useAppStore.getState().accessToken
        if (!accessToken) return
        getDeviceDirectoryPort()
            .listDevices(idpUrl, accessToken)
            .then(
                ({ devices }) => {
                    if (!live) return
                    const before = runs
                    fanout.devicesListed(devices)
                    if (runs === before && unsettled) review()
                },
                (error: unknown) => warnE2ee("reading the device list", error)
            )
    }
    const fanout = new DeviceFanout({
        session: { idpUrl, actorUri: user.actor_uri, accessToken: () => useAppStore.getState().accessToken },
        e2ee: getE2eePort(),
        sync,
        refreshDevices: readList,
        report: warnE2ee,
    })
    const stops = [
        onConversationList((list) => fanout.conversationsChanged(list.rows.map((row) => row.id))),
        onSocketEvent((event) => {
            if (event.type === "device_joined" || event.type === "device_approved") readList()
        }),
        onSocketConnected(readList),
        appVisibility.onChange(() => {
            if (appVisibility.visible()) readList()
        }),
    ]
    fanout.start()
    readList()
    return () => {
        live = false
        stops.forEach((stop) => stop())
        fanout.stop()
    }
}
