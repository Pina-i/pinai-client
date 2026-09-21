import type { IE2eePort } from "../../ports/e2ee.port"

export interface SetupRecoveryKeyDeps {
    e2eePort: IE2eePort
}

export interface SetupRecoveryKeyInput {
    idpUrl: string
    accessToken: string
    /**
     * User-chosen passphrase. The UI's strength meter is the user-
     * facing guard; the port enforces a minimum length as defence in
     * depth.
     */
    passphrase: string
}

/**
 * Wrap the local MSK with the user's passphrase (Argon2id KEK +
 * XChaCha20-Poly1305) and upload to `PUT /api/keys/recovery`.
 *
 * Surfaced in the Phase 6 onboarding flow ("Set up Recovery Key") and
 * Settings → Security ("Change passphrase" — that path calls this
 * twice: unwrap+rewrap or just generate a fresh wrap from the local
 * keypair).
 */
export const setupRecoveryKeyUseCase =
    ({ e2eePort }: SetupRecoveryKeyDeps) =>
    async (input: SetupRecoveryKeyInput): Promise<void> => {
        await e2eePort.setupRecoveryKey(input.idpUrl, input.accessToken, input.passphrase)
    }
