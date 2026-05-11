import type { ActorUri, DeviceId, Fingerprint } from "@/domain/models/e2ee"
import type { IE2eePort } from "@/domain/ports/e2ee.port"

export interface RecoverFromPassphraseDeps {
    e2eePort: IE2eePort
}

export interface RecoverFromPassphraseInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
    passphrase: string
}

/**
 * "I lost all my devices but I have my passphrase" path. Pulls the
 * wrapped MSK from `GET /api/keys/recovery`, unwraps it, generates
 * fresh SSK + USK + device leaf, republishes the identity row, and
 * seeds a fresh KeyPackage stash so peers can re-add this device to
 * existing groups.
 *
 * Peers see the same MSK fingerprint after recovery, so the
 * identity-change warning doesn't fire — only the *device* is new.
 *
 * Surfaced in Phase 6 onboarding ("Restore from Recovery Key").
 */
export const recoverFromPassphraseUseCase =
    ({ e2eePort }: RecoverFromPassphraseDeps) =>
    async (
        input: RecoverFromPassphraseInput,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint }> => {
        return e2eePort.recoverFromPassphrase(
            input.idpUrl,
            input.accessToken,
            input.actorUri,
            input.passphrase,
        )
    }
