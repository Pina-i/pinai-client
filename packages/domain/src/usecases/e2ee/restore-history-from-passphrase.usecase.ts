import { deviceAdmission } from "../../models/admission"
import type { ActorUri } from "../../models/e2ee"
import { passphraseVerdict } from "../../models/history-key"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"
import type { ISessionPort } from "../../ports/session.port"

import { approveByPassphraseUseCase } from "./approve-by-passphrase.usecase"
import { registerIdentityUseCase } from "./register-identity.usecase"
import { setUpThisDeviceUseCase } from "./set-up-this-device.usecase"
import { shareOnceHeld, type ShareOnceHeldDeps } from "./share-history-key.usecase"

export interface RestoreHistoryDeps extends ShareOnceHeldDeps {
    sessionPort: ISessionPort
    historyArchivePort: IHistoryArchivePort
}

export interface RestoreHistoryInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
    passphrase: string[]
}

export type PassphraseRestore =
    /** Kept, approved and reported, its KeyPackages out: the archive's restore is due (`HistoryRestore`). */
    | { kind: "kept"; generation: number }
    /** The words don't give the key's check value. Nothing kept. */
    | { kind: "wrong-passphrase" }
    /** The right check value under another approval key: the instance changed it. Nothing kept. */
    | { kind: "key-swapped" }
    /** The account has no history key to check the words against. */
    | { kind: "no-key" }
    /** The key in force is older than one this device has seen. Nothing kept. */
    | { kind: "rolled-back" }
    /** A generation was set while the device approved itself: the words kept no longer give the key. */
    | { kind: "key-changed" }

/**
 * The 24 words typed on this device (`identity-provider/specs/e2ee.md § 6.4`): checked against
 * the key in force before anything is read, an empty archive or not. Right, the restore is marked
 * due, the words are kept, the device approves itself with them and reports the generation — it is
 * in: its KeyPackages go out —, then shares them with its partners waiting for them. The restore
 * itself is `HistoryRestore`'s, so one cut short runs again.
 */
export const restoreHistoryFromPassphraseUseCase =
    (deps: RestoreHistoryDeps) =>
    async ({ idpUrl, accessToken, actorUri, passphrase }: RestoreHistoryInput): Promise<PassphraseRestore> => {
        await setUpThisDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
        const key = await deps.historyArchivePort.getKey(idpUrl, accessToken)
        if (!key) return { kind: "no-key" }
        const seen = await deps.e2eePort.newestHistoryGeneration()
        if (seen !== null && key.generation < seen) return { kind: "rolled-back" }
        const verdict = passphraseVerdict(await deps.e2eePort.deriveHistoryKey(passphrase, key.salt), key)
        if (verdict === "wrong") return { kind: "wrong-passphrase" }
        if (verdict === "key-swapped") return { kind: "key-swapped" }

        await deps.e2eePort.markHistoryRestoreDue(key.generation)
        await deps.e2eePort.keepPassphrase(passphrase, key)
        const standing = await approveByPassphraseUseCase(deps)(idpUrl, accessToken, actorUri)
        if (standing.kind !== "holds") return { kind: "key-changed" }
        await registerIdentityUseCase(deps)({ idpUrl, accessToken, actorUri, admission: deviceAdmission(standing, null) })
        await shareOnceHeld(deps, idpUrl, accessToken, actorUri)
        return { kind: "kept", generation: key.generation }
    }
