/**
 * The IdP key directory + MLS Delivery Service, as the client needs it.
 *
 * A port, not an adapter interface: the E2EE core talks to it to claim key
 * packages, post commits and welcomes, and store the wrapped recovery blob,
 * and none of that is HTTP-specific. Keeping the contract here is what stops
 * the crypto core from having to depend on the REST client that happens to
 * implement it today.
 *
 * Endpoint shapes come from `identity-provider/specs/e2ee.md`. The DTOs
 * below are the wire shapes, base64 already decoded to bytes.
 */

import type {
    ActorUri,
    ClaimedKeyPackage,
    ConversationId,
    DeviceId,
    IdentityPublicKeys,
    KeyPackageStatusResponse,
} from "../models/e2ee"

export interface CommitView {
    id: string
    conversation_id: ConversationId
    epoch: number
    proposer_actor_uri: ActorUri
    /** TLS-encoded MLS Commit. */
    commit_blob: Uint8Array
    created_at: string
}

export interface WelcomeView {
    id: string
    conversation_id: ConversationId
    recipient_device_id: DeviceId
    /** TLS-encoded MLS Welcome. */
    welcome_blob: Uint8Array
    created_at: string
}

export interface IdentityKeysResponse {
    keys: IdentityPublicKeys
    published_at: string
    rotated_at: string
}

export interface Argon2Params {
    /** Memory cost in KiB. */
    m_kib: number
    /** Time cost (iterations). */
    t: number
    /** Parallelism. */
    p: number
}

export interface RecoveryBlobResponse {
    /** XChaCha20-Poly1305 ciphertext of MSK, with 24-byte nonce prepended. */
    wrapped_msk: Uint8Array
    /** ≥ 16 bytes — server validates this. */
    salt: Uint8Array
    argon2_params: Argon2Params
    created_at: string
    updated_at: string
}

/** Response from `POST /api/keys/devices`. `signed_message` is returned so the client can locally re-verify. */
export interface RegisterDeviceResponse {
    signature: Uint8Array
    kid: string
    issued_at: string
    expires_at: string
    signed_message: Uint8Array
}

export interface IKeyDirectoryPort {
    publishIdentity(
        idpUrl: string,
        accessToken: string,
        keys: IdentityPublicKeys,
    ): Promise<void>
    getIdentity(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<IdentityKeysResponse | null>
    /** Register/renew/rotate the device's IdP-attested Device Root Key. Idempotent on `(device_id, drk_pub)`. */
    registerDevice(
        idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
        drkPublicKey: Uint8Array,
    ): Promise<RegisterDeviceResponse>

    uploadKeyPackages(
        idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
        packages: { key_package: Uint8Array; expires_at: string }[],
    ): Promise<{ uploaded: number; available_after: number }>
    /**
     * Claim a single KeyPackage for `actorUri`. Pass `deviceId = null`
     * to let the server pick any device with spare KPs (cross-IdP
     * pattern); pass a specific `deviceId` for same-user multi-device
     * targeting.
     */
    claimKeyPackage(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        deviceId: DeviceId | null,
    ): Promise<ClaimedKeyPackage>
    /**
     * One KeyPackage of each of `actorUri`'s devices that has any
     * (`POST /api/keys/packages/claim/devices`): a contact's first add
     * brings all their devices in.
     */
    claimEachDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<ClaimedKeyPackage[]>
    getKeyPackageStatus(
        idpUrl: string,
        accessToken: string,
    ): Promise<KeyPackageStatusResponse>

    // ─── MLS Delivery Service ────────────────────────────────────────

    postCommit(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        epoch: number,
        commitBlob: Uint8Array,
    ): Promise<CommitView>

    getCommitsSince(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        sinceEpoch: number,
    ): Promise<{ commits: CommitView[]; has_more: boolean }>

    getWelcomes(
        idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
    ): Promise<WelcomeView[]>

    /**
     * Hand a Welcome bundle to the sender's own IdP for delivery. The
     * IdP routes based on `recipient_actor_uri`:
     *  - **Local recipient** → row in `mls_welcomes` + `MlsWelcomeReady`
     *    WS event. Returns the inserted id.
     *  - **Remote recipient** → signed AP `Create{Note}` with
     *    `mlsKind: welcome` to the recipient IdP's inbox. Returns
     *    `{ id: nil-uuid }` (no local row).
     *
     * Sender authenticates via Bearer; the receiving (or originating)
     * IdP applies the relevant trust check.
     */
    postWelcome(
        idpUrl: string,
        accessToken: string,
        body: {
            recipient_actor_uri: ActorUri
            recipient_device_id: DeviceId
            conversation_id: ConversationId
            welcome_blob: Uint8Array
        },
    ): Promise<{ id: string }>

    // ─── Recovery Key ─────────────────────────────────────────────────

    putRecoveryBlob(
        idpUrl: string,
        accessToken: string,
        body: { wrapped_msk: Uint8Array; salt: Uint8Array; argon2_params: Argon2Params },
    ): Promise<void>
    /** Returns null when the user hasn't opted into Recovery Key. */
    getRecoveryBlob(
        idpUrl: string,
        accessToken: string,
    ): Promise<RecoveryBlobResponse | null>
    /** Opt out — clears the wrapped blob. No-op if nothing was set. */
    deleteRecoveryBlob(idpUrl: string, accessToken: string): Promise<void>
}
