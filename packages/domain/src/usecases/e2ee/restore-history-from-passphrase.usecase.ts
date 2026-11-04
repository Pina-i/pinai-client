import type { ActorUri } from "../../models/e2ee"
import { restoredMessages, type RestoredMessage } from "../../models/history-archive"
import { passphraseVerdict } from "../../models/history-key"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"
import type { ISessionPort } from "../../ports/session.port"

import { approveByPassphraseUseCase } from "./approve-by-passphrase.usecase"
import { registerIdentityUseCase } from "./register-identity.usecase"
import { setUpThisDeviceUseCase } from "./set-up-this-device.usecase"

export interface RestoreHistoryDeps {
    e2eePort: IE2eePort
    sessionPort: ISessionPort
    historyArchivePort: IHistoryArchivePort
    deviceDirectoryPort: IDeviceDirectoryPort
}

export interface RestoreHistoryInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
    passphrase: string[]
}

export type PassphraseRestore =
    | {
          kind: "restored"
          messages: RestoredMessage[]
          /** Entries the key opened. */
          decrypted: number
          /** Entries that didn't open: damaged, or moved to other ids. */
          skipped: number
      }
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
 * the key in force before anything is read, an empty archive or not. Right, they are kept, the
 * device approves itself with them and reports the generation, then the archive is restored.
 */
export const restoreHistoryFromPassphraseUseCase =
    (deps: RestoreHistoryDeps) =>
    async ({ idpUrl, accessToken, actorUri, passphrase }: RestoreHistoryInput): Promise<PassphraseRestore> => {
        await setUpThisDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
        await registerIdentityUseCase(deps)({ idpUrl, accessToken, actorUri })
        const key = await deps.historyArchivePort.getKey(idpUrl, accessToken)
        if (!key) return { kind: "no-key" }
        const seen = await deps.e2eePort.newestHistoryGeneration()
        if (seen !== null && key.generation < seen) return { kind: "rolled-back" }
        const verdict = passphraseVerdict(await deps.e2eePort.deriveHistoryKey(passphrase, key.salt), key)
        if (verdict === "wrong") return { kind: "wrong-passphrase" }
        if (verdict === "key-swapped") return { kind: "key-swapped" }

        await deps.e2eePort.keepPassphrase(passphrase, key)
        const standing = await approveByPassphraseUseCase(deps)(idpUrl, accessToken, actorUri)
        if (standing.kind !== "holds") return { kind: "key-changed" }
        const { entries, skipped } = await deps.e2eePort.restoreHistory(idpUrl, accessToken)
        return { kind: "restored", messages: restoredMessages(entries), decrypted: entries.length, skipped }
    }
