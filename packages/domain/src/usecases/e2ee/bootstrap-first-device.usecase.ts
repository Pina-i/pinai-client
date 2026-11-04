import { deviceAdmission } from "../../models/admission"
import type { ActorUri } from "../../models/e2ee"
import { FIRST_HISTORY_GENERATION } from "../../models/history-key"
import { isHistoryKeyConflict } from "../../models/idp-error"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IHistoryArchivePort } from "../../ports/history-archive.port"
import type { ISessionPort } from "../../ports/session.port"

import { approveByPassphraseUseCase } from "./approve-by-passphrase.usecase"
import { checkHistoryKeyUseCase } from "./check-history-key.usecase"
import { registerIdentityUseCase } from "./register-identity.usecase"
import { setUpThisDeviceUseCase } from "./set-up-this-device.usecase"

export interface BootstrapFirstDeviceDeps {
    e2eePort: IE2eePort
    sessionPort: ISessionPort
    historyArchivePort: IHistoryArchivePort
    deviceDirectoryPort: IDeviceDirectoryPort
}

export interface BootstrapFirstDeviceInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
}

export type FirstDeviceOutcome =
    /** This device holds the account's passphrase: the words to show. */
    | { kind: "holds"; words: string[] }
    /** The account has a key this device doesn't hold: another device set it, maybe at the same moment. */
    | { kind: "has-key" }

/**
 * The account's first device (`identity-provider/specs/e2ee.md § 6.1`): set up, a pending key
 * settled, then — no key in force — generation 1 minted and sealed as pending, set, and only once
 * the IdP took it kept, approved, reported and shown. Its KeyPackages go out once it holds the key,
 * never before. Another device's key erases it.
 */
export const bootstrapFirstDeviceUseCase =
    (deps: BootstrapFirstDeviceDeps) =>
    async ({ idpUrl, accessToken, actorUri }: BootstrapFirstDeviceInput): Promise<FirstDeviceOutcome> => {
        await setUpThisDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
        let standing = await checkHistoryKeyUseCase(deps)(idpUrl, accessToken, actorUri)
        if (standing.kind === "no-key") {
            const { key } = await deps.e2eePort.mintHistoryKey(FIRST_HISTORY_GENERATION)
            try {
                await deps.historyArchivePort.setKey(idpUrl, accessToken, key)
            } catch (error) {
                if (!isHistoryKeyConflict(error)) throw error
                await deps.e2eePort.dropPendingHistoryKey()
                return { kind: "has-key" }
            }
            await deps.e2eePort.promotePendingHistoryKey()
            standing = await approveByPassphraseUseCase(deps)(idpUrl, accessToken, actorUri)
        }
        if (standing.kind !== "holds") return { kind: "has-key" }
        await registerIdentityUseCase(deps)({ idpUrl, accessToken, actorUri, admission: deviceAdmission(standing, null) })
        const words = await deps.e2eePort.loadStoredPassphrase()
        return words ? { kind: "holds", words } : { kind: "has-key" }
    }
