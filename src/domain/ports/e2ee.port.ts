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
     * Cheap predicate the onboarding gate uses to decide whether to
     * probe the server or skip straight into the app. Returns true
     * when an identity bundle exists in IndexedDB for this device.
     */
    hasLocalIdentity(): Promise<boolean>

    /**
     * Returns the actor URI the local identity is bound to (set after
     * register / recoverFromPassphrase) or null. The onboarding gate
     * uses this to detect cross-account contamination — Alice logging
     * out and Pierre logging back in on the same browser must NOT
     * have Pierre inherit Alice's keys.
     */
    getBoundActorUri(): Promise<ActorUri | null>

    /**
     * Returns this device's stable UUID. The Settings → Devices view uses
     * it to mark the current row — the server doesn't know which row is
     * the caller.
     */
    getDeviceId(): Promise<DeviceId>

    /**
     * Wipe every encrypted IDB row owned by this device — identity
     * bundle, MLS snapshot, recovery passphrase, meta (device key +
     * device id). Used by the gate when it detects a different user
     * has signed in on this browser. After this returns, the device
     * looks "fresh" to the next gate run.
     *
     * Best-effort: per-DB errors are swallowed because the worst
     * outcome is that the gate sees a partial state and retries.
     */
    wipeLocalDevice(): Promise<void>

    /**
     * First-device bootstrap. Generates the local identity, registers the
     * DRK attestation, mints a 24-word recovery passphrase + history-archive
     * salt, persists locally. Deduplicated against concurrent callers
     * (StrictMode double-fire would otherwise mint two different mnemonics).
     */
    bootstrapFirstDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint; words: string[] }>

    /** Source for the Settings → Devices passphrase-reveal UI. */
    loadStoredPassphrase(): Promise<string[] | null>

    saveStoredPassphrase(words: string[]): Promise<void>

    /** Idempotent. Legacy no-op since the server-side recovery blob endpoint is gone. */
    clearRecoveryKey(idpUrl: string, accessToken: string): Promise<void>

    /**
     * True when a wrapped MSK blob is configured on the server for
     * this account. Used by the onboarding gate to decide between the
     * full "Recover history" view and the degraded "Start fresh only"
     * variant on a new device. Surfaces as a `boolean` rather than the
     * raw blob to keep the caller from leaking ciphertext bytes around.
     */
    hasRecoveryKey(idpUrl: string, accessToken: string): Promise<boolean>

    /**
     * Compute the local user's MSK fingerprint for the UI. Reads from
     * the identity bundle in IndexedDB; returns null if the user
     * hasn't called `register` yet on this device.
     */
    getOwnFingerprint(): Promise<Fingerprint | null>

    /** Legacy — returns null since per-device IdP attestation replaced peer MSK fingerprints. */
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

    // ─── Legacy — kept on the interface for the integration test stub ──

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

    // ─── Per-device IdP attestation + history backup ────────────────────

    /**
     * Idempotent — generates the DRK on first call, mints (or renews) the
     * IdP attestation, persists locally. Silent renewal at 30 days from expiry.
     */
    registerDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<void>

    /** Locally-cached 24-word passphrase, or null. */
    getCachedPassphrase(): Promise<string[] | null>

    /** History-archive upload lifecycle — the auth layout starts/stops these. */
    startFlushing(idpUrl: string, accessToken: string): void
    stopFlushing(): void

    /**
     * Decrypt the server-side archive under the passphrase, push restored
     * entries via the `onPlaintextRestored` callback. `skipped` counts
     * AES-GCM auth-tag failures (wrong passphrase, unrelated archive).
     */
    restoreHistoryFromPassphrase(
        idpUrl: string,
        accessToken: string,
        passphrase: string[],
    ): Promise<{ restored: number; skipped: number }>

    /** Wipe server archive + drop local passphrase + purge cached HAK. */
    clearHistoryBackup(idpUrl: string, accessToken: string): Promise<void>

    // ─── Pairing ──────────────────────────────────────────────────────

    /**
     * Begin a pairing session on the existing device. Returns the QR
     * payload + the SPAKE2 message to ferry to the new device. The
     * caller drives the protocol message-by-message; transport is
     * unwired today.
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
