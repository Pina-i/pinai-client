import { deviceAdmission } from "../../models/admission"
import { endsTheWait, enterDelay } from "../../models/approval-handshake"
import type { ActorUri } from "../../models/e2ee"
import type { KeyShareRefusal } from "../../models/key-share"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"
import type { IKeySharePort } from "../../ports/key-share.port"

import { approveByPassphraseUseCase } from "./approve-by-passphrase.usecase"
import { registerIdentityUseCase } from "./register-identity.usecase"
import { shareOnceHeld, type ShareOnceHeldDeps } from "./share-history-key.usecase"

export interface AcceptHistoryShareDeps extends ShareOnceHeldDeps {
    historyArchivePort: IHistoryArchivePort
    keySharePort: IKeySharePort
}

export type ShareAcceptance =
    /** The words kept, the device approved by them and its generation reported: the archive's restore is due. */
    | { kind: "kept"; generation: number }
    /** The device holds the current passphrase already. */
    | { kind: "holds" }
    /** No share waits, or no key is in force. */
    | { kind: "none" }
    /** The share isn't for the key in force, or that key is older than one seen: left alone. */
    | { kind: "stale" }
    /** Left unused: it failed a check of § 3.11, a trust event standing — or, `unsettled`, the revocations kept can't be read. */
    | { kind: "refused"; reason: KeyShareRefusal | "unsettled" }
    /** A generation was set while the device approved itself. */
    | { kind: "key-changed" }

/**
 * The recipient's side of `identity-provider/specs/e2ee.md § 3.11`, for a device that doesn't hold
 * the current passphrase: its share read, the four checks run in order against the key in force,
 * and only then the words kept (18f's flow), the device approved by them, its generation reported —
 * which deletes the share —, its KeyPackages published, and the generation shared with its own
 * partners. The restore is marked due before the words are kept, so a page that closes first
 * leaves it for the next start.
 */
export function acceptHistoryShareUseCase(deps: AcceptHistoryShareDeps) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<ShareAcceptance> => {
        const standing = await deps.e2eePort.checkHistoryKey(idpUrl, accessToken)
        if (standing.kind === "holds") return { kind: "holds" }
        if (standing.kind === "no-key") return { kind: "none" }
        const share = await deps.keySharePort.waiting(idpUrl, accessToken)
        if (!share) return { kind: "none" }
        const key = await deps.historyArchivePort.getKey(idpUrl, accessToken)
        if (!key) return { kind: "none" }
        const seen = await deps.e2eePort.newestHistoryGeneration()
        if (share.generation !== key.generation || (seen !== null && key.generation < seen)) return { kind: "stale" }

        const opened = await deps.e2eePort.openHistoryShare(actorUri, share, key)
        if (!opened.ok) return { kind: "refused", reason: opened.reason }
        await deps.e2eePort.markHistoryRestoreDue(key.generation)
        await deps.e2eePort.keepPassphrase(opened.words, key)
        const approved = await approveByPassphraseUseCase(deps)(idpUrl, accessToken, actorUri)
        if (approved.kind !== "holds") return { kind: "key-changed" }
        await registerIdentityUseCase(deps)({ idpUrl, accessToken, actorUri, admission: deviceAdmission(approved, null) })
        await shareOnceHeld(deps, idpUrl, accessToken, actorUri)
        return { kind: "kept", generation: key.generation }
    }
}

/** `unusable`: the share failed a check, and the same one would again. */
export type AwaitedShareState =
    | { kind: "waiting" }
    | { kind: "kept" }
    | { kind: "unusable"; reason: KeyShareRefusal }
    | { kind: "ended"; error: unknown }

/**
 * A device without the words reading its share until it holds them, through `accept` — the page's
 * one guarded call of `acceptHistoryShareUseCase` —, on the entry's backoff (`enterDelay`), one read
 * at a time. A share that fails a check ends it, as does `endsTheWait`; anything else is waited out.
 */
export class AwaitedShare {
    state: AwaitedShareState = { kind: "waiting" }

    private readonly accept: () => Promise<ShareAcceptance | null>
    private readonly report: ((what: string, error: unknown) => void) | undefined
    private attempts = 0
    private ticking: Promise<void> | null = null
    private readonly listeners = new Set<() => void>()

    constructor(accept: () => Promise<ShareAcceptance | null>, report?: (what: string, error: unknown) => void) {
        this.accept = accept
        this.report = report
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    tick(): Promise<void> {
        this.ticking ??= this.step().finally(() => {
            this.ticking = null
        })
        return this.ticking
    }

    nextDelay(): number {
        return enterDelay(Math.max(0, this.attempts - 1))
    }

    /** The share is likelier now — the device was just approved: the backoff starts over. */
    again(): Promise<void> {
        this.attempts = 0
        return this.tick()
    }

    private async step(): Promise<void> {
        if (this.state.kind !== "waiting") return
        try {
            const accepted = await this.accept()
            if (accepted?.kind === "kept" || accepted?.kind === "holds") return this.set({ kind: "kept" })
            if (accepted?.kind === "refused" && accepted.reason !== "unsettled") return this.set({ kind: "unusable", reason: accepted.reason })
        } catch (error) {
            if (endsTheWait(error)) return this.set({ kind: "ended", error })
            this.report?.("reading the history key share", error)
        }
        this.attempts += 1
    }

    private set(state: AwaitedShareState): void {
        this.state = state
        for (const listener of this.listeners) listener()
    }
}
