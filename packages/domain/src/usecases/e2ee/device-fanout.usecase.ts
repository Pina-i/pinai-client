import { deviceListKey, type DeviceListEntry } from "../../models/device"
import type { ActorUri, ConversationId } from "../../models/e2ee"
import { unclaimedRetryDelay } from "../../models/group"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { OwnGroupsSync } from "./sync-own-groups.usecase"

export interface DeviceFanoutDeps {
    session: { idpUrl: string; actorUri: ActorUri; accessToken: () => string | null }
    e2ee: Pick<IE2eePort, "onGroupHeld" | "onDeviceRegistered">
    /** `syncOwnGroupsUseCase` over the platform's ports, one run at a time for the whole app (`oneAtATime`). */
    sync: (idpUrl: string, accessToken: string, actorUri: ActorUri, conversationIds: readonly ConversationId[]) => Promise<OwnGroupsSync>
    /** A registration changed this device's row: the platform reads the list again and hands it over. */
    refreshDevices: () => void
    report: (what: string, error: unknown) => void
}

/**
 * When the groups this device holds are kept in step with the account's devices (`syncOwnGroupsUseCase`), for every
 * client: once the platform holds a device list, at each change of what a review reads of it (`deviceListKey`: a
 * refetch that changed nothing runs nothing), of the conversation ids, and on a group held. While a sibling stays
 * `unclaimed` it runs again after `unclaimedRetryDelay`, until none is left. Nothing after `stop`.
 */
export class DeviceFanout {
    private live = false
    private listKey: string | null = null
    private conversationIds: readonly ConversationId[] = []
    private idsKey = ""
    private attempts = 0
    private retry: ReturnType<typeof setTimeout> | undefined
    private stops: (() => void)[] = []
    private readonly deps: DeviceFanoutDeps

    constructor(deps: DeviceFanoutDeps) {
        this.deps = deps
    }

    start(): void {
        if (this.live) return
        this.live = true
        const { e2ee, refreshDevices } = this.deps
        // A group founded or joined changes neither the device list nor, often, the ids.
        this.stops = [e2ee.onGroupHeld(() => this.run()), e2ee.onDeviceRegistered(refreshDevices)]
        this.run()
    }

    /** The list as the platform last read it. */
    devicesListed(devices: readonly DeviceListEntry[]): void {
        const key = deviceListKey(devices)
        if (key === this.listKey) return
        this.listKey = key
        this.run()
    }

    conversationsChanged(conversationIds: readonly ConversationId[]): void {
        const key = conversationIds.join(",")
        if (key === this.idsKey) return
        this.idsKey = key
        this.conversationIds = conversationIds
        this.run()
    }

    stop(): void {
        this.live = false
        clearTimeout(this.retry)
        for (const stop of this.stops.splice(0)) stop()
    }

    // With no conversation, the list is still reviewed: revocations kept, devices announced.
    private run(): void {
        if (!this.live || this.listKey === null) return
        const { session, sync, report } = this.deps
        const accessToken = session.accessToken()
        if (!accessToken) return
        sync(session.idpUrl, accessToken, session.actorUri, this.conversationIds).then(
            (outcome) => this.settle(outcome),
            (e: unknown) => report("keeping the groups in step", e),
        )
    }

    private settle({ unclaimed, reviewFailure, shareFailure, failed }: OwnGroupsSync): void {
        const { report } = this.deps
        clearTimeout(this.retry)
        if (unclaimed.length === 0) this.attempts = 0
        else if (this.live) this.retry = setTimeout(() => this.run(), unclaimedRetryDelay(this.attempts++))
        if (reviewFailure !== undefined) report("reviewing the device list", reviewFailure)
        if (shareFailure !== undefined) report("sharing the history passphrase; tried again at the next refresh", shareFailure)
        for (const { conversationId, error } of failed) report(`keeping ${conversationId} in step`, error)
    }
}
