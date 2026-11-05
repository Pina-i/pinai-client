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
 * `rearchive`: the new words replace words this device holds, and its copy is archived again under
 * them. `over`: the generation they replace — another in force by then is a `conflict`.
 */
export interface NewGenerationOptions {
    rearchive?: boolean
    over?: number
}

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
    async (input: StartOverInput): Promise<StartOver> => {
        const { idpUrl, accessToken, actorUri, tokenArrivedAt = null } = input
        const unseen = await unseenNewWords(deps, input)
        if (unseen) return unseen
        if (!signedInRecently(accessToken, tokenArrivedAt)) return { kind: "recent-sign-in" }
        await setUpThisDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
        const set = await setNewGeneration(deps, idpUrl, accessToken)
        if (set.kind !== "set") return set
        return finishNewGeneration(deps, input, set.generation)
    }

/**
 * New words this device set and the user hasn't gone past, still the generation in force: what
 * follows them redone, and answered again. `null` otherwise, a mark no longer in force dropped.
 */
export async function unseenNewWords(deps: StartOverDeps, input: StartOverInput): Promise<StartOver | null> {
    const unseen = await deps.e2eePort.newWordsToShow()
    if (!unseen) return null
    const current = await deps.historyArchivePort.getKey(input.idpUrl, input.accessToken)
    if (current?.generation === unseen.generation) {
        await setUpThisDeviceUseCase(deps)(input.idpUrl, input.accessToken, input.actorUri)
        return finishNewGeneration(deps, input, unseen.generation)
    }
    await deps.e2eePort.dismissNewWords()
    return null
}

/** Generation n+1 minted as pending, `PUT`, then kept and marked to show: in the pending key's turn. */
export function setNewGeneration(
    deps: StartOverDeps,
    idpUrl: string,
    accessToken: string,
    options: NewGenerationOptions = {},
): Promise<Setting> {
    return pendingKeyTurn(deps, () => setNextGeneration(deps, idpUrl, accessToken, options))
}

/**
 * A failure other than the IdP's refusal leaves the pending key: the `PUT` may have landed. Trying
 * again sends the same words, or finds them in force and keeps them; the next start settles them
 * otherwise. A refusal reads the key again first: one that landed all the same is kept.
 */
async function setNextGeneration(
    deps: StartOverDeps,
    idpUrl: string,
    accessToken: string,
    { rearchive = false, over }: NewGenerationOptions,
): Promise<Setting> {
    const e2ee = deps.e2eePort
    const current = await deps.historyArchivePort.getKey(idpUrl, accessToken)
    const pending = await e2ee.pendingHistoryKey()
    if (pending && current && sameHistoryKey(pending, current)) {
        await e2ee.promotePendingHistoryKey({ show: true, rearchive })
        return { kind: "set", generation: current.generation }
    }
    // Read outside this turn, the generation replaced may have moved since: never replace one not held.
    if (over !== undefined && (current?.generation ?? 0) !== over) {
        if (pending) await e2ee.dropPendingHistoryKey()
        return { kind: "conflict" }
    }
    const generation = startOverGeneration(current, await e2ee.newestHistoryGeneration())
    if (generation === null) return { kind: "rolled-back" }
    if (pending && pending.generation !== generation) await e2ee.dropPendingHistoryKey()

    const { key } = await e2ee.mintHistoryKey(generation, { rearchive })
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
    await e2ee.promotePendingHistoryKey({ show: true, rearchive })
    return { kind: "set", generation }
}

/** Once the IdP took a new generation: approved, reported, KeyPackages, shares — best effort —, then its words. */
export async function finishNewGeneration(
    deps: StartOverDeps,
    { idpUrl, accessToken, actorUri }: StartOverInput,
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
