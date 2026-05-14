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
     * Returns this device's stable UUID. The Settings → Devices view
     * (Phase 6b) reads it to mark the current row with an "This
     * device" chip — the server doesn't know which row is the caller.
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
     * Phase 6a — first-device bootstrap. Generates the identity,
     * mints a 24-word BIP-39 recovery passphrase, wraps the MSK and
     * uploads to `PUT /api/keys/recovery`, persists the passphrase
     * locally for the future Settings → Devices reveal UI.
     *
     * Deduplicated at the adapter level: concurrent callers (e.g.
     * React StrictMode's double-effect-fire, sibling components that
     * both mount the setup viewmodel) share the same in-flight
     * promise. Without this guarantee the racing calls would each
     * generate their own mnemonic, the local + server copies could
     * end up out of sync, and recovery on a new device would fail.
     */
    bootstrapFirstDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint; words: string[] }>

    /**
     * Returns the recovery passphrase saved on this device at setup
     * time, or null when the device has none (fresh install, the user
     * never set one up, or it was explicitly cleared via the 6b
     * "Clear recovery key" action). Source for the Settings → Devices
     * reveal UI in Phase 6b.
     */
    loadStoredPassphrase(): Promise<string[] | null>

    /**
     * Persist the recovery passphrase on this device so the user can
     * retrieve it later from Settings. Encrypted under the same
     * device key as the rest of the e2ee state.
     */
    saveStoredPassphrase(words: string[]): Promise<void>

    /**
     * Delete the wrapped MSK on the server AND wipe the local
     * passphrase copy. Used by Phase 6b "Clear recovery key". Idempotent.
     */
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

    // ─── Phase 7 — per-device IdP attestation + history backup ──────────

    /**
     * Phase 7 — register/renew/rotate this device's DRK attestation.
     * Idempotent. Generates a DRK on first call, calls
     * `POST /api/keys/devices`, persists the attestation locally.
     * Subsequent calls reuse the stored DRK and renew when within 30
     * days of expiry; otherwise short-circuit.
     */
    registerDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<void>

    /**
     * Phase 7 — fetch the locally-cached recovery passphrase, or null
     * when the device has no copy stored (paired-via-QR device, fresh
     * install, or explicitly cleared).
     */
    getCachedPassphrase(): Promise<string[] | null>

    /**
     * Phase 7 — Layer B history-backup engine controls. The adapter
     * owns an internal buffer of decrypted plaintexts plus a debounced
     * flush timer; `startFlushing` / `stopFlushing` manage the timer
     * lifecycle and the lifecycle hook in the authenticated layout
     * wraps them.
     */
    startFlushing(idpUrl: string, accessToken: string): void
    stopFlushing(): void

    /**
     * Phase 7 — Layer B restore. Given the 24-word passphrase, pulls
     * the user's encrypted plaintext archive from the server, decrypts
     * each entry under the derived HAK, and pushes successful entries
     * into the local message store via the `onPlaintextRestored`
     * callback configured at adapter construction.
     *
     * Returns counts: `restored` is the number of entries successfully
     * decoded; `skipped` is the count of AES-GCM auth-tag failures
     * (wrong passphrase or unrelated archive).
     */
    restoreHistoryFromPassphrase(
        idpUrl: string,
        accessToken: string,
        passphrase: string[],
    ): Promise<{ restored: number; skipped: number }>

    /**
     * Phase 7 — `DELETE /api/history/messages` + drop local cached
     * passphrase + memory-purge cached HAK. After clearing, the
     * per-decrypt upload becomes a no-op (no key to encrypt with)
     * until the user re-generates a passphrase.
     */
    clearHistoryBackup(idpUrl: string, accessToken: string): Promise<void>

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
