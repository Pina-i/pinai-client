import type {
    ActorUri,
    ApplicationMessage,
    ConversationId,
    DeviceId,
    Fingerprint,
    KeyPackageStatusResponse,
} from "@/domain/models/e2ee"

/**
 * High-level, transport-agnostic E2EE operations the rest of the app
 * uses. The implementation lives in `adapters/e2ee/` and stitches
 * together the MLS engine (`openmls-wasm`), per-user identity keys,
 * IndexedDB persistence, and the IdP REST surface.
 *
 * The presentation layer only ever talks to this port — never directly
 * to the WASM bundle or the key-directory REST endpoints.
 *
 * Phase 5 wires `encryptOutbound` / `decryptInbound` into
 * `ConversationPage.viewmodel.ts::sendMessage` and the WS `new_dm`
 * handler. Phase 6 surfaces `register` / `pair` / `revokeDevice` /
 * `setupRecoveryKey` / `recoverFromPassphrase` in the UI.
 */
export interface IE2eePort {
    /**
     * One-time setup on a fresh device. Generates the MSK / SSK / USK
     * triple, publishes the public halves to
     * `POST /api/keys/identity`, then uploads an initial KeyPackage
     * stash via `POST /api/keys/packages`.
     *
     * Idempotent: calling on a device that already has a stored
     * identity is a no-op (returns the existing fingerprint).
     */
    register(idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<{
        device_id: DeviceId
        fingerprint: Fingerprint
    }>

    /**
     * Compute the local user's MSK fingerprint for the UI. Reads from
     * the identity bundle in IndexedDB; returns null if the user
     * hasn't called `register` yet on this device.
     */
    getOwnFingerprint(): Promise<Fingerprint | null>

    /**
     * Fetch a peer's MSK fingerprint via `GET /api/keys/identity/:actor_uri`.
     * Returns null when the peer hasn't published an identity row.
     *
     * Phase 6's first-contact pin / identity-change UX layers a cache
     * + warning on top — this method is purely the "go fetch + compute"
     * primitive.
     */
    getPeerFingerprint(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<Fingerprint | null>

    /**
     * Encrypt an `ApplicationMessage` for delivery. Returns the
     * TLS-encoded `MLSMessage` bytes ready to ship as
     * `mls_ciphertext` over `POST /api/dm` / WS `send_dm`.
     *
     * Throws if the conversation has no MLS group state (the caller
     * must have `addContactToGroup`'d at least one peer first).
     */
    encryptOutbound(
        conversationId: ConversationId,
        message: ApplicationMessage,
    ): Promise<Uint8Array>

    /**
     * Decrypt an inbound `mls_ciphertext` blob. Returns the
     * `ApplicationMessage` plaintext on success; advances the local
     * group epoch on commits; appends to pending proposals on
     * proposals (returns `null` for both — caller treats it as "no
     * UI plaintext to render").
     *
     * When `catchUp` is supplied, decrypt failures (e.g. we're behind
     * by one or more commits) trigger a one-shot
     * `GET /api/mls/groups/:id/commits?since=:epoch` fetch, replay
     * each missing commit through `processMessage`, then retry the
     * original decrypt once. Without `catchUp`, the call is read-only
     * — useful when the caller doesn't have an access token at hand
     * (or wants to skip a surprise REST round-trip).
     */
    decryptInbound(
        conversationId: ConversationId,
        ciphertext: Uint8Array,
        catchUp?: { idpUrl: string; accessToken: string },
    ): Promise<ApplicationMessage | null>

    /**
     * Bring `actor_uri` into a conversation: claim a fresh KeyPackage
     * via `POST /api/keys/packages/claim`, build an MLS Add commit +
     * Welcome, deliver them through the IdP DS endpoints. If the
     * conversation has no group yet (first message), the group is
     * created here.
     */
    addContactToGroup(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        actorUri: ActorUri,
    ): Promise<void>

    /**
     * "I am about to send a message to `recipientActorUri` in
     * `conversationId` — make sure I have an MLS group state for it."
     * Idempotent: if the group already exists, returns immediately;
     * otherwise calls {@link IE2eePort.addContactToGroup} to claim a
     * KeyPackage, build the founding commit + welcome, and dispatch
     * them.
     */
    ensureGroupExists(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        recipientActorUri: ActorUri,
    ): Promise<void>

    /**
     * One-shot pull of every pending Welcome aimed at this device,
     * joining each group locally. Called on login + on
     * `MlsWelcomeReady` WS events. `actorUri` ensures the MLS
     * adapter's per-device identity is bound before joining.
     */
    consumePendingWelcomes(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ joined: number }>

    /**
     * Revoke another device of this user. Builds + delivers one MLS
     * Remove commit per conversation it's a member of; PCS recovers
     * within each commit. The caller passes the conversation list
     * (typically every active DM/group from the local store) so the
     * port stays free of zustand. Clears the wrapped Recovery Key
     * blob when `also_clear_recovery` is set.
     */
    revokeDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        deviceId: DeviceId,
        conversationIds: ConversationId[],
        opts?: { also_clear_recovery?: boolean },
    ): Promise<{ removed_from: ConversationId[] }>

    /**
     * Background poll of `GET /api/keys/packages/status`. When any
     * device reports `needs_refill`, generates fresh KeyPackages and
     * uploads them via `POST /api/keys/packages` capped at the
     * server-reported max.
     */
    replenishKeyPackages(
        idpUrl: string,
        accessToken: string,
    ): Promise<KeyPackageStatusResponse>

    // ─── Recovery Key (Phase 4b — pending) ────────────────────────────
    //
    // These will land alongside the Argon2id integration. Stubs here
    // so the port shape is stable and the use cases can compile.

    setupRecoveryKey(
        idpUrl: string,
        accessToken: string,
        passphrase: string,
    ): Promise<void>

    recoverFromPassphrase(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        passphrase: string,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint }>

    // ─── Pairing ──────────────────────────────────────────────────────

    /**
     * Begin a pairing session on the existing device. Returns the
     * QR payload to display + the SPAKE2 message to send to the new
     * device through whatever transport the UI provides.
     *
     * Phase 6 wires up the actual transport (IdP relay endpoint or
     * WebRTC). For now the caller drives the protocol message-by-
     * message via {@link IE2eePort.completePairingAsInitiator}.
     */
    startPairingAsInitiator(): Promise<{
        qr_payload: string
        spake_message: Uint8Array
        finalize: (
            responderMessage: Uint8Array,
            responderConfirmation: Uint8Array,
        ) => Promise<{ our_confirmation: Uint8Array; sealed_bundle: Uint8Array }>
    }>

    /**
     * New-device side of pairing. Caller supplies the QR payload
     * (string) it just scanned and the initiator's SPAKE2 message
     * (received via transport).
     *
     * Returns this device's SPAKE2 message + confirmation to send
     * back, plus a finaliser that — given the initiator's reply —
     * persists the recovered identity locally and seeds a fresh
     * KeyPackage stash.
     */
    pairAsResponder(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        qrPayload: string,
        initiatorSpakeMessage: Uint8Array,
    ): Promise<{
        spake_message: Uint8Array
        our_confirmation: Uint8Array
        finalize: (
            initiatorConfirmation: Uint8Array,
            sealedBundle: Uint8Array,
        ) => Promise<{ device_id: DeviceId; fingerprint: Fingerprint }>
    }>
}

export const E2EE_PORT = "E2EE_PORT"
