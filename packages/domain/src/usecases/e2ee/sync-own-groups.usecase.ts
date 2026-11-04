import type { DeviceTrustVerdict } from "../../models/device-trust"
import type { ActorUri, ConversationId } from "../../models/e2ee"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"

type Failure = { conversationId: ConversationId; error: unknown }

export type OwnGroupsSync = { added: number; removed: number; failed: Failure[]; reviewFailure?: unknown }

export type OwnGroupsSyncDeps = {
    e2ee: Pick<IE2eePort, "catchUp" | "refreshOwnLeaf" | "reviewDevices" | "removeUntrustedLeaves" | "addOwnDevices">
    deviceDirectory: Pick<IDeviceDirectoryPort, "listDevices">
}

/**
 * Keep each conversation this device holds keys for in step (`identity-provider/specs/e2ee.md
 * § 6.2`, § 3.9): every group caught up and its own leaf made current; then the device list read
 * again and reviewed, after the catch-ups, so a sibling's add they brought in is judged on a list
 * as new as it; then in each group the untrusted leaves committed out and the approved devices it
 * lacks added. Each step that fails is named with its conversation and left for the next run; a
 * group that failed to catch up goes no further.
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

    const review = async () => {
        const { devices } = await deps.deviceDirectory.listDevices(idpUrl, accessToken)
        return e2ee.reviewDevices(idpUrl, accessToken, actorUri, devices)
    }
    let trust: DeviceTrustVerdict | null = null
    let reviewFailure: unknown = undefined
    try {
        trust = await review()
    } catch (error) {
        reviewFailure = error
    }
    // Once a run, at the first own leaf it would commit out: `device_approved` may come after a sibling's add.
    let again: Promise<DeviceTrustVerdict | null> | null = null
    const reviewAgain = () =>
        (again ??= review().then(
            (fresh) => (trust = fresh),
            (error: unknown) => {
                reviewFailure ??= error
                return (trust = null)
            },
        ))

    let added = 0
    let removed = 0
    for (const conversationId of caughtUp) {
        try {
            removed += (await e2ee.removeUntrustedLeaves(idpUrl, accessToken, conversationId, trust, reviewAgain)).removed
        } catch (error) {
            failed.push({ conversationId, error })
        }
        const now: DeviceTrustVerdict | null = trust
        if (!now?.acting) continue
        try {
            added += (await e2ee.addOwnDevices(idpUrl, accessToken, conversationId, now)).added
        } catch (error) {
            failed.push({ conversationId, error })
        }
    }
    return reviewFailure === undefined ? { added, removed, failed } : { added, removed, failed, reviewFailure }
}

/**
 * One run at a time: a call made during one waits for it, then the calls made meanwhile are one run,
 * with the latest arguments, which answers them all.
 */
export function oneAtATime<A extends unknown[], R>(run: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    let running: Promise<R> | null = null
    let next: { args: A; settle: Promise<R>; resolve: (r: R) => void; reject: (e: unknown) => void } | null = null
    const start = (args: A): Promise<R> => {
        const current = run(...args)
        running = current
        void current
            .catch(() => undefined)
            .then(() => {
                running = null
                const queued = next
                next = null
                if (queued) start(queued.args).then(queued.resolve, queued.reject)
            })
        return current
    }
    return (...args: A) => {
        if (!running) return start(args)
        if (next) {
            next.args = args
            return next.settle
        }
        let resolve!: (r: R) => void
        let reject!: (e: unknown) => void
        const settle = new Promise<R>((res, rej) => ((resolve = res), (reject = rej)))
        next = { args, settle, resolve, reject }
        return settle
    }
}
