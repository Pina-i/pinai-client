import { deviceAdmission } from "../../models/admission"
import { signedInRecently } from "../../models/auth"
import type { ActorUri } from "../../models/e2ee"
import { sameHistoryKey, settlePending, startOverGeneration, type HistoryKeyStanding } from "../../models/history-key"
import { isHistoryKeyConflict, needsRecentSignIn } from "../../models/idp-error"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"
import type { ISessionPort } from "../../ports/session.port"

import { approveByPassphraseUseCase } from "./approve-by-passphrase.usecase"
import { registerIdentityUseCase } from "./register-identity.usecase"
import { setUpThisDeviceUseCase } from "./set-up-this-device.usecase"
import { pendingKeyTurn, type PendingKeyLock } from "./settle-pending-history-key.usecase"
import { shareOnceHeld, type ShareOnceHeldDeps } from "./share-history-key.usecase"

export interface StartOverDeps extends ShareOnceHeldDeps {
    sessionPort: ISessionPort
    historyArchivePort: IHistoryArchivePort
    pendingKeyLock?: PendingKeyLock
}

export interface StartOverInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
    /** When the access token reached this device, on its own clock: the password's age is then read on the IdP's. */
    tokenArrivedAt?: number | null
}

export type StartOver =
    /** The account's new generation, this device's. The words to show; what follows is redone if it failed. */
    | { kind: "started-over"; generation: number; words: string[] }
    /** The password wasn't typed recently enough: nothing minted, or the pending key erased. Sign in again, then confirm again. */
    | { kind: "recent-sign-in" }
    /** Another device set that generation first: the pending key erased, nothing kept, nothing to show. */
    | { kind: "conflict" }
    /** The key in force isn't past every generation this device has seen: only the instance can put it back. */
    | { kind: "rolled-back" }
    /** This device started over, then another generation landed before it approved itself: its words give nothing now. */
    | { kind: "key-changed" }

type Setting = { kind: "set"; generation: number } | { kind: "recent-sign-in" } | { kind: "conflict" } | { kind: "rolled-back" }

/**
 * Starting over (`identity-provider/specs/e2ee.md § 6.11`). New words a start over set and the user
 * hasn't gone past are answered again, never a second start over. Otherwise the password typed
 * recently is checked first — nothing is minted without it —, then generation n+1 is minted and
 * sealed as pending and `PUT`; once the IdP took it, the start over has happened: its words are kept
 * and marked to show. Approving, reporting, the KeyPackages and the shares are best effort from
 * there — reported, never thrown —, and the page-load check, the tick and the fanout redo them. The
 * archive is the IdP's to erase; the device's own copy of its messages stays.
 */
export const startOverUseCase =
    (deps: StartOverDeps) =>
    async ({ idpUrl, accessToken, actorUri, tokenArrivedAt = null }: StartOverInput): Promise<StartOver> => {
        const unseen = await deps.e2eePort.newWordsToShow()
        if (unseen) {
            const current = await deps.historyArchivePort.getKey(idpUrl, accessToken)
            if (current?.generation === unseen.generation) {
                await setUpThisDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
                return finish(deps, { idpUrl, accessToken, actorUri }, unseen.generation)
            }
            await deps.e2eePort.dismissNewWords()
        }
        if (!signedInRecently(accessToken, tokenArrivedAt)) return { kind: "recent-sign-in" }
        await setUpThisDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
        const set = await pendingKeyTurn(deps, () => setNextGeneration(deps, idpUrl, accessToken))
        if (set.kind !== "set") return set
        return finish(deps, { idpUrl, accessToken, actorUri }, set.generation)
    }

/**
 * A failure other than the IdP's refusal leaves the pending key: the `PUT` may have landed. Trying
 * again sends the same words, or finds them in force and keeps them; the next start settles them
 * otherwise. A refusal reads the key again first: one that landed all the same is kept.
 */
async function setNextGeneration(deps: StartOverDeps, idpUrl: string, accessToken: string): Promise<Setting> {
    const e2ee = deps.e2eePort
    const current = await deps.historyArchivePort.getKey(idpUrl, accessToken)
    const pending = await e2ee.pendingHistoryKey()
    if (pending && current && sameHistoryKey(pending, current)) {
        await e2ee.promotePendingHistoryKey({ show: true })
        return { kind: "set", generation: current.generation }
    }
    const generation = startOverGeneration(current, await e2ee.newestHistoryGeneration())
    if (generation === null) return { kind: "rolled-back" }
    if (pending && pending.generation !== generation) await e2ee.dropPendingHistoryKey()

    const { key } = await e2ee.mintHistoryKey(generation)
    try {
        await deps.historyArchivePort.setKey(idpUrl, accessToken, key)
    } catch (error) {
        const recentSignIn = needsRecentSignIn(error)
        if (!recentSignIn && !isHistoryKeyConflict(error)) throw error
        if (settlePending(key, await deps.historyArchivePort.getKey(idpUrl, accessToken)) !== "keep") {
            await e2ee.dropPendingHistoryKey()
            return { kind: recentSignIn ? "recent-sign-in" : "conflict" }
        }
    }
    await e2ee.promotePendingHistoryKey({ show: true })
    return { kind: "set", generation }
}

async function finish(
    deps: StartOverDeps,
    { idpUrl, accessToken, actorUri }: Omit<StartOverInput, "tokenArrivedAt">,
    generation: number,
): Promise<StartOver> {
    const bestEffort = async (what: string, run: () => Promise<unknown>) => {
        try {
            await run()
        } catch (error) {
            deps.report?.(what, error)
        }
    }
    let standing: HistoryKeyStanding | null = null
    await bestEffort("approving this device by its new words", async () => {
        standing = await approveByPassphraseUseCase(deps)(idpUrl, accessToken, actorUri)
    })
    const approved = standing as HistoryKeyStanding | null
    if (approved && (approved.kind !== "holds" || approved.generation !== generation)) {
        await deps.e2eePort.dismissNewWords()
        return { kind: "key-changed" }
    }
    const holds: HistoryKeyStanding = approved ?? { kind: "holds", generation, settled: false }
    await bestEffort("publishing KeyPackages", () =>
        registerIdentityUseCase(deps)({ idpUrl, accessToken, actorUri, admission: deviceAdmission(holds, null) }),
    )
    await shareOnceHeld(deps, idpUrl, accessToken, actorUri)
    const words = (await deps.e2eePort.newWordsToShow())?.words ?? (await deps.e2eePort.loadStoredPassphrase())
    if (!words) throw new Error("The new words weren't kept")
    return { kind: "started-over", generation, words }
}
