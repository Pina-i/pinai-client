import { signedInRecently } from "../../models/auth"
import type { BaselineIntent } from "../../models/device-trust"
import { restoredMessages, type RestoredMessage } from "../../models/history-archive"
import { sameHistoryKey, type HistoryKey } from "../../models/history-key"

import { setUpThisDeviceUseCase } from "./set-up-this-device.usecase"
import {
    finishNewGeneration,
    setNewGeneration,
    unseenNewWords,
    type StartOver,
    type StartOverDeps,
    type StartOverInput,
} from "./start-over.usecase"

export type WordsReplacement =
    /** The account's new generation, this device's: the words to show, the re-archive due under it. */
    | { kind: "replaced"; generation: number; words: string[] }
    | Exclude<StartOver, { kind: "started-over" }>
    /** This device doesn't hold the current words, or a key of its own other than a replacement's waits. */
    | { kind: "not-acting" }
    /** A restore under the generation held hasn't been applied: what it brings would be erased. */
    | { kind: "restore-due" }
    /** This page load's cache isn't read back: there is nothing to save the history again from. */
    | { kind: "cache-unread" }
    /** The archive couldn't be brought onto this device first: nothing minted. */
    | { kind: "restore-failed"; error: unknown }

const REPLACED: BaselineIntent = { cause: "replacement", refused: null }

export interface ReplaceWordsDeps extends StartOverDeps {
    /** Whether this page load's cache was read back. */
    cacheRead: () => boolean
    /** The archive's messages into this device's copy: the restore's own apply. */
    applyRestored: (messages: RestoredMessage[]) => Promise<void>
}

/** The archive is brought onto this device before the `PUT` erases it, so the re-archive saves it again. */
export const replaceWordsUseCase =
    (deps: ReplaceWordsDeps) =>
    async (input: StartOverInput): Promise<WordsReplacement> => {
        const { idpUrl, accessToken, tokenArrivedAt = null } = input
        const unseen = await unseenNewWords(deps, input, REPLACED)
        if (unseen) return replaced(unseen)
        const pending = await deps.e2eePort.pendingHistoryKey()
        if (pending && !pending.rearchive) return { kind: "not-acting" }
        // Its answer lost, the IdP took it already: kept now, with nothing left to bring or ask.
        if (pending && sameKey(pending, await deps.historyArchivePort.getKey(idpUrl, accessToken))) {
            return newWords(deps, input, pending.generation - 1)
        }
        const standing = await deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
        if (standing.kind !== "holds") return { kind: "not-acting" }
        const due = await deps.e2eePort.historyRestoreDue()
        if (due?.generation === standing.generation && due.appliedAt === null) return { kind: "restore-due" }
        if (!deps.cacheRead()) return { kind: "cache-unread" }
        if (!signedInRecently(accessToken, tokenArrivedAt)) return { kind: "recent-sign-in" }
        try {
            const { entries } = await deps.e2eePort.restoreHistory(idpUrl, accessToken)
            await deps.applyRestored(restoredMessages(entries))
        } catch (error) {
            return { kind: "restore-failed", error }
        }
        return newWords(deps, input, standing.generation)
    }

function sameKey(pending: HistoryKey, current: HistoryKey | null): boolean {
    return current !== null && sameHistoryKey(pending, current)
}

async function newWords(deps: ReplaceWordsDeps, input: StartOverInput, over: number): Promise<WordsReplacement> {
    await setUpThisDeviceUseCase(deps)(input.idpUrl, input.accessToken, input.actorUri)
    const set = await setNewGeneration(deps, input.idpUrl, input.accessToken, { rearchive: true, over, intent: REPLACED })
    if (set.kind !== "set") return set
    return replaced(await finishNewGeneration(deps, input, set.generation, REPLACED))
}

function replaced(outcome: StartOver): WordsReplacement {
    return outcome.kind === "started-over" ? { kind: "replaced", generation: outcome.generation, words: outcome.words } : outcome
}
