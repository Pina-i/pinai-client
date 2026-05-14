/**
 * Top-level `IE2eePort` implementation. Wires the four sub-adapters
 * (MLS engine, identity-key generator, encrypted IndexedDB store,
 * IdP REST surface) into the high-level operations the rest of the
 * app calls.
 *
 * Phase 4b foundation:
 *  - `register` — fresh device, MSK + SSK + USK + initial KeyPackage stash.
 *  - `replenishKeyPackages` — background refill against the IdP cap.
 *  - `encryptOutbound` / `decryptInbound` — per-conversation pipe.
 *  - `addContactToGroup` — cross-IdP add, claim → commit → welcome → DS.
 *
 * Pending Phase 4b sub-tasks (typed here so the port is stable, but
 * methods throw at call-time):
 *  - Recovery Key (Argon2id wrap/unwrap).
 *  - SPAKE2 device pairing.
 *  - `revokeDevice`.
 *
 * Phase 5 wires `encryptOutbound` / `decryptInbound` into the
 * `ConversationPage.viewmodel.ts` and the `useIdpWebSocket.ts` `new_dm`
 * handler.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import type {
    ActorUri,
    ApplicationMessage,
    ConversationId,
    DeviceId,
    Fingerprint,
    KeyPackageStatusResponse,
} from "@/domain/models/e2ee"
import type { IE2eePort } from "@/domain/ports/e2ee.port"
import type { IHistoryArchivePort } from "@/domain/ports/history-archive.port"

import type { HistoryArchiveAdapter } from "./history-archive.adapter"
import type { IdentityAdapter } from "./identity.adapter"
import type { IKeyDirectoryAdapter } from "./key-directory.adapter"
import type { MlsAdapter } from "./mls.adapter"
import { PairingInitiator, PairingResponder } from "./pairing.adapter"
import type { RecoveryAdapter } from "./recovery.adapter"
import type { DeviceAttestation, E2eeStorage } from "./storage.adapter"

/** Phase 7 — silent renewal triggers when remaining validity drops below this. */
const ATTESTATION_RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function attestationNeedsRenewal(att: DeviceAttestation): boolean {
    const expires = Date.parse(att.expires_at)
    if (Number.isNaN(expires)) return true
    return expires - Date.now() < ATTESTATION_RENEWAL_WINDOW_MS
}

/**
 * Default lifetime for a freshly-built KeyPackage, in milliseconds.
 * Mirrors the IdP's `E2EE_KEYPACKAGE_LIFETIME_DAYS = 30` default; the
 * server validates `expires_at - now()` against its own ceiling.
 */
const DEFAULT_KEY_PACKAGE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Tag string used to encode a `Uint8Array` as a JSON-friendly value
 * inside an `ApplicationMessage` body (e.g. the AES key + nonce
 * carried by `TextBody.attachments[]`). Plain `JSON.stringify` turns
 * a `Uint8Array` into an indexed object — readable but useless to
 * Web Crypto on the receiving side, which expects a real
 * `BufferSource`. The replacer below rewrites every `Uint8Array` it
 * encounters as a tagged base64 string; the reviver reverses it.
 */
const U8_TAG = "@u8:"

function bytesToB64(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}

function b64ToBytes(s: string): Uint8Array {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

function applicationMessageReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Uint8Array) return U8_TAG + bytesToB64(value)
    return value
}

function applicationMessageReviver(_key: string, value: unknown): unknown {
    if (typeof value === "string" && value.startsWith(U8_TAG)) {
        return b64ToBytes(value.slice(U8_TAG.length))
    }
    return value
}

/**
 * How many KeyPackages we upload on first registration. The IdP caps
 * at 100 by default; 50 is half of that — enough to seed the stash
 * with headroom but not so many that the first registration blocks
 * for noticeable time.
 */
const INITIAL_KEY_PACKAGE_BATCH = 50

export class E2eeAdapter implements IE2eePort {
    private readonly identity: IdentityAdapter
    private readonly mls: MlsAdapter
    private readonly storage: E2eeStorage
    private readonly directory: IKeyDirectoryAdapter
    private readonly recovery: RecoveryAdapter
    // Phase 7 — optional history-backup wiring. When unset, the per-decrypt
    // buffer is silently disabled (no flushing happens). IoC always provides
    // these in production; tests can omit to keep the old surface working.
    private readonly historyArchive: IHistoryArchivePort | null
    private readonly historyCrypto: HistoryArchiveAdapter | null
    private readonly onPlaintextRestored:
        | ((conversationId: ConversationId, messageId: string, plaintext: Uint8Array) => void)
        | null

    constructor(
        identity: IdentityAdapter,
        mls: MlsAdapter,
        storage: E2eeStorage,
        directory: IKeyDirectoryAdapter,
        recovery: RecoveryAdapter,
        historyArchive: IHistoryArchivePort | null = null,
        historyCrypto: HistoryArchiveAdapter | null = null,
        onPlaintextRestored:
            | ((conversationId: ConversationId, messageId: string, plaintext: Uint8Array) => void)
            | null = null,
    ) {
        this.identity = identity
        this.mls = mls
        this.storage = storage
        this.directory = directory
        this.recovery = recovery
        this.historyArchive = historyArchive
        this.historyCrypto = historyCrypto
        this.onPlaintextRestored = onPlaintextRestored
    }

    // ─── Phase 7 — per-device IdP attestation ────────────────────────

    private registerDevicePromise: Promise<void> | null = null

    async registerDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<void> {
        // Reuse an in-flight registration so concurrent callers (e.g. the
        // onboarding gate + bootstrap-first-device usecase) share one HTTP
        // round-trip and one IDB write.
        if (this.registerDevicePromise) return this.registerDevicePromise
        this.registerDevicePromise = this.doRegisterDevice(idpUrl, accessToken, actorUri)
        try {
            await this.registerDevicePromise
        } finally {
            // Allow retries on failure; success can re-execute later
            // (e.g. on attestation expiry) by clearing the cache.
            this.registerDevicePromise = null
        }
    }

    private async doRegisterDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<void> {
        void actorUri // Bound on the server side via the bearer token; included for symmetry with the design doc.

        // Load existing DRK + attestation if any; mint fresh if absent.
        const existing = await this.storage.loadDeviceAttestation()
        let drkPrivate: Uint8Array
        let drkPublic: Uint8Array

        if (existing && !attestationNeedsRenewal(existing)) {
            return
        }
        if (existing) {
            drkPrivate = existing.drk_private
            drkPublic = existing.drk_public
        } else {
            const kp = ed25519.keygen()
            drkPrivate = kp.secretKey
            drkPublic = kp.publicKey
        }

        const deviceId = await this.storage.getOrCreateDeviceId()
        const response = await this.directory.registerDevice(
            idpUrl,
            accessToken,
            deviceId,
            drkPublic,
        )
        await this.storage.saveDeviceAttestation({
            drk_public: drkPublic,
            drk_private: drkPrivate,
            signature: response.signature,
            kid: response.kid,
            issued_at: response.issued_at,
            expires_at: response.expires_at,
            signed_message: response.signed_message,
        })
    }

    // ─── Phase 7 — history-backup engine ─────────────────────────────

    private archiveBuffer: Array<{
        conversationId: ConversationId
        messageId: string
        plaintext: Uint8Array
    }> = []
    private flushTimer: ReturnType<typeof setInterval> | null = null
    private cachedHak: Uint8Array | null = null
    private flushIdpUrl: string | null = null
    private flushAccessToken: string | null = null

    /**
     * Phase 7 — buffer a freshly decrypted plaintext for upload. Called
     * internally from `decryptInbound` (wired in Phase 5). No-op when
     * `historyArchive` / `historyCrypto` aren't wired or the user
     * doesn't have a stored passphrase yet.
     */
    bufferDecryptedForArchive(
        conversationId: ConversationId,
        messageId: string,
        plaintext: Uint8Array,
    ): void {
        if (!this.historyArchive || !this.historyCrypto) return
        this.archiveBuffer.push({ conversationId, messageId, plaintext })
        if (this.archiveBuffer.length >= 10) void this.flushArchiveNow()
    }

    startFlushing(idpUrl: string, accessToken: string): void {
        this.flushIdpUrl = idpUrl
        this.flushAccessToken = accessToken
        if (this.flushTimer || !this.historyArchive) return
        this.flushTimer = setInterval(() => {
            void this.flushArchiveNow()
        }, 2000)
    }

    stopFlushing(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer)
            this.flushTimer = null
        }
        this.flushIdpUrl = null
        this.flushAccessToken = null
        this.cachedHak = null
    }

    async getCachedPassphrase(): Promise<string[] | null> {
        return this.storage.loadRecoveryPassphrase()
    }

    async restoreHistoryFromPassphrase(
        idpUrl: string,
        accessToken: string,
        passphrase: string[],
    ): Promise<{ restored: number; skipped: number }> {
        if (!this.historyArchive || !this.historyCrypto) {
            return { restored: 0, skipped: 0 }
        }
        const salt = await this.historyArchive.getSalt(idpUrl, accessToken)
        if (!salt) return { restored: 0, skipped: 0 }
        const hak = await this.historyCrypto.deriveKey(passphrase, salt)

        let restored = 0
        let skipped = 0
        let cursor: { after_id: string; after_created_at: string } | null = null
        do {
            const page = await this.historyArchive.downloadPage(
                idpUrl,
                accessToken,
                cursor,
                100,
            )
            for (const entry of page.entries) {
                try {
                    const plain = await this.historyCrypto.decrypt(
                        hak,
                        entry.ciphertext,
                        entry.nonce,
                    )
                    if (this.onPlaintextRestored) {
                        this.onPlaintextRestored(
                            entry.conversation_id as ConversationId,
                            entry.id,
                            plain,
                        )
                    }
                    restored += 1
                } catch {
                    skipped += 1
                }
            }
            cursor = page.next_cursor
        } while (cursor)
        return { restored, skipped }
    }

    async clearHistoryBackup(idpUrl: string, accessToken: string): Promise<void> {
        if (this.historyArchive) {
            await this.historyArchive.wipeArchive(idpUrl, accessToken)
        }
        await this.storage.clearRecoveryPassphrase()
        this.cachedHak = null
        this.archiveBuffer = []
    }

    /**
     * Drain the buffered plaintexts into the server. Derives HAK lazily
     * on first flush per session via `(salt, cached passphrase)`; when
     * no passphrase is stored locally the buffer just sits there and
     * the next clear() / page reload drops it.
     */
    private async flushArchiveNow(): Promise<void> {
        if (
            !this.historyArchive ||
            !this.historyCrypto ||
            this.archiveBuffer.length === 0 ||
            !this.flushIdpUrl ||
            !this.flushAccessToken
        ) {
            return
        }
        if (!this.cachedHak) {
            const phrase = await this.storage.loadRecoveryPassphrase()
            if (!phrase) return
            const salt = await this.historyArchive.getSalt(this.flushIdpUrl, this.flushAccessToken)
            if (!salt) return
            this.cachedHak = await this.historyCrypto.deriveKey(phrase, salt)
        }
        const toFlush = this.archiveBuffer.splice(0, this.archiveBuffer.length)
        try {
            const entries = await Promise.all(
                toFlush.map(async (e) => {
                    const { ciphertext, nonce } = await this.historyCrypto!.encrypt(
                        this.cachedHak!,
                        e.plaintext,
                    )
                    return {
                        id: e.messageId,
                        conversation_id: e.conversationId,
                        ciphertext,
                        nonce,
                    }
                }),
            )
            await this.historyArchive.uploadBatch(
                this.flushIdpUrl,
                this.flushAccessToken,
                entries,
            )
        } catch (err) {
            // Re-queue so the next tick retries.
            // eslint-disable-next-line no-console
            console.warn("[history-archive] flush failed; re-buffering", err)
            this.archiveBuffer.unshift(...toFlush)
        }
    }

    /**
     * Lazy-init guard — `register` and most other operations need the
     * MLS engine alive. Idempotent and race-safe.
     *
     * On the *first* call after page load, restores the persisted MLS
     * provider snapshot (if any) so previously-joined groups come back
     * online. Subsequent calls within the session skip the restore.
     *
     * `localActorUri` is **the local user's** actor URI — used to
     * stamp this device's MLS leaf credential. Pass `null` for paths
     * that legitimately don't have it (e.g. `addContactToGroup`'s
     * cross-IdP `ensureGroupExists`); in that case identity binding
     * is skipped, and the caller must have already invoked `register`
     * / `consumePendingWelcomes` / similar so identity is bound. If
     * not bound and `null` is passed, the next MLS op will throw a
     * clear "no identity" error rather than silently mis-binding.
     *
     * Concurrency: both the provider/snapshot bootstrap and the
     * identity bind are guarded by cached promises so two concurrent
     * callers (React strict-mode double-fire, simultaneous
     * onboarding-bootstrap + `useConsumeMlsWelcomes` effects, etc.)
     * never produce two MLS Identity leaves competing for the same
     * provider — the second one used to silently orphan the first
     * and leave its keypair unreachable in storage.
     */
    private async ensureInitialized(localActorUri: ActorUri | null): Promise<void> {
        if (!this.providerInitPromise) {
            this.providerInitPromise = this.doProviderInit()
        }
        await this.providerInitPromise

        if (this.identityBound || !localActorUri) return
        if (!this.identityBindPromise) {
            this.identityBindPromise = this.doBindIdentity(localActorUri)
        }
        await this.identityBindPromise
    }

    private async doProviderInit(): Promise<void> {
        await this.mls.initialize()
        if (this.snapshotRestored) return
        this.snapshotRestored = true
        const snap = await this.storage.loadMlsSnapshot()
        if (!snap) return
        try {
            this.mls.restoreStorage(snap.provider_state, snap.known_group_ids)
        } catch (e) {
            // Corrupt snapshot — boot from scratch. The welcome-poll
            // loop will eventually re-pull every group's MLS state
            // from the IdP.
            // eslint-disable-next-line no-console
            console.warn("MLS snapshot restore failed; starting fresh:", e)
        }
    }

    private async doBindIdentity(localActorUri: ActorUri): Promise<void> {
        const deviceId = await this.storage.getOrCreateDeviceId()
        // Try to recover an already-stored signing key from one of the
        // restored groups' leaf credentials before falling back to
        // fresh-key generation. Without this, every page reload would
        // mint a new MLS leaf keypair and orphan the previous one —
        // peers' trees still reference the old public key, so signature
        // verification fails on the next inbound application message
        // ("process PrivateMessage failed: Verifying the signature
        // failed.").
        const existingKey = this.mls.findOwnLeafSigKey(localActorUri, deviceId)
        this.mls.setIdentity(localActorUri, deviceId, existingKey ?? undefined)
        this.identityBound = true
        // First-ever bind generates a fresh keypair into the provider
        // storage; persist now so the next reload picks it up via the
        // findOwnLeafSigKey path above. Subsequent binds (existingKey
        // present) don't actually mutate state but the snapshot save
        // is cheap and keeps the invariant simple.
        await this.persistMlsState()
    }

    private identityBound = false
    private snapshotRestored = false
    private providerInitPromise: Promise<void> | null = null
    private identityBindPromise: Promise<void> | null = null
    private registerPromise: Promise<{ device_id: DeviceId; fingerprint: Fingerprint }> | null = null
    private bootstrapPromise:
        | Promise<{ device_id: DeviceId; fingerprint: Fingerprint; words: string[] }>
        | null = null

    /**
     * Take a fresh provider snapshot + the current group-id list and
     * write them through the storage adapter. Called after every
     * MLS state-changing operation.
     *
     * The persistence is best-effort: a failure here doesn't roll
     * back the in-memory MLS state. On the next successful op the
     * full new state replaces whatever's on disk anyway.
     */
    private async persistMlsState(): Promise<void> {
        try {
            const provider_state = this.mls.serializeStorage()
            const known_group_ids = this.mls.knownGroupIds()
            await this.storage.saveMlsSnapshot({ provider_state, known_group_ids })
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("MLS snapshot save failed:", e)
        }
    }

    async register(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint }> {
        // Gate concurrent calls. After Phase 6a, `register` is driven
        // by the onboarding setup view's `bootstrapFirstDeviceUseCase`
        // and the recovery-restore view's "Start fresh" link. Under
        // React strict mode the page can re-render and re-invoke the
        // effect that triggers it. Without this gate, both invocations
        // would race: each would upload INITIAL_KEY_PACKAGE_BATCH=50
        // KPs, the IdP would land both batches, and the next refresh
        // would hit "stash cap exceeded: have 100, uploading 50,
        // cap is 100".
        if (this.registerPromise) return this.registerPromise
        this.registerPromise = this.doRegister(idpUrl, accessToken, actorUri)
        try {
            return await this.registerPromise
        } catch (e) {
            // Allow retries on failure; success can stay cached so
            // re-mounts within the same session short-circuit.
            this.registerPromise = null
            throw e
        }
    }

    private async doRegister(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint }> {
        await this.ensureInitialized(actorUri)

        const deviceId = await this.storage.getOrCreateDeviceId()
        let keypair = await this.storage.loadIdentityKeypair()

        if (!keypair) {
            keypair = this.identity.generate()
            await this.storage.saveIdentityKeypair(keypair)
            // First-ever registration: publish the public triple.
            await this.directory.publishIdentity(
                idpUrl,
                accessToken,
                this.identity.publicKeys(keypair),
            )
        }

        // Bind the device to this actor URI so the onboarding gate can
        // detect cross-account contamination on the next mount. Done
        // unconditionally (covers both the first-register path AND
        // re-runs against an existing keypair, where the binding may
        // not yet be set from a legacy session).
        await this.storage.setBoundActorUri(actorUri)

        // Seed the KeyPackage stash, but only refill what's missing
        // up to the IdP's cap. A previous (broken) session may have
        // already published KPs whose private halves are gone — the
        // IdP would still count them against the cap, and a blind
        // upload of `INITIAL_KEY_PACKAGE_BATCH` would 4xx. Polling
        // status first turns the flow into "top up to cap, never
        // overshoot."
        const status = await this.directory.getKeyPackageStatus(idpUrl, accessToken)
        const myDevice = status.devices.find((d) => d.device_id === deviceId)
        const have = myDevice?.available ?? 0
        const wanted = Math.min(INITIAL_KEY_PACKAGE_BATCH, Math.max(0, status.cap - have))
        if (wanted > 0) {
            await this.uploadKeyPackageBatch(idpUrl, accessToken, deviceId, wanted)
        }

        return {
            device_id: deviceId,
            fingerprint: this.identity.fingerprint(keypair.msk_public),
        }
    }

    async bootstrapFirstDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint; words: string[] }> {
        if (this.bootstrapPromise) return this.bootstrapPromise
        this.bootstrapPromise = this.doBootstrapFirstDevice(idpUrl, accessToken, actorUri)
        try {
            return await this.bootstrapPromise
        } catch (e) {
            // Allow retries on failure; success can stay cached so
            // re-mounts within the same session short-circuit.
            this.bootstrapPromise = null
            throw e
        }
    }

    private async doBootstrapFirstDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint; words: string[] }> {
        const { device_id, fingerprint } = await this.register(idpUrl, accessToken, actorUri)

        // Idempotency across hard refresh: if a passphrase already
        // exists locally (a previous bootstrap on this device
        // completed at least step 4), reuse it. Generating a fresh
        // mnemonic here would silently invalidate any words the user
        // already wrote down — the new mnemonic would overwrite the
        // server blob, and the old words they have on paper would no
        // longer unlock the account.
        const existing = await this.storage.loadRecoveryPassphrase()
        if (existing && existing.length === 24) {
            return { device_id, fingerprint, words: existing }
        }

        const mnemonic = generateMnemonic(wordlist, 256)
        const words = mnemonic.split(" ")
        if (words.length !== 24) {
            throw new Error(`bootstrap: expected 24-word mnemonic, got ${words.length}`)
        }
        await this.setupRecoveryKey(idpUrl, accessToken, mnemonic)
        await this.storage.saveRecoveryPassphrase(words)
        return { device_id, fingerprint, words }
    }

    async hasLocalIdentity(): Promise<boolean> {
        return (await this.storage.loadIdentityKeypair()) !== null
    }

    async getBoundActorUri(): Promise<ActorUri | null> {
        return this.storage.getBoundActorUri()
    }

    async getDeviceId(): Promise<DeviceId> {
        return this.storage.getOrCreateDeviceId()
    }

    async wipeLocalDevice(): Promise<void> {
        try {
            await this.storage.clear()
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("wipeLocalDevice: storage.clear failed (best-effort)", e)
        }
        // Drop the in-memory MLS provider so the next op starts fresh
        // — without this, the wiped IDB would race a cached Provider
        // instance still holding the previous user's group state.
        this.snapshotRestored = false
        this.identityBound = false
        this.providerInitPromise = null
        this.identityBindPromise = null
        this.registerPromise = null
        this.bootstrapPromise = null
        this.mls.resetProvider()
    }

    async loadStoredPassphrase(): Promise<string[] | null> {
        return this.storage.loadRecoveryPassphrase()
    }

    async saveStoredPassphrase(words: string[]): Promise<void> {
        return this.storage.saveRecoveryPassphrase(words)
    }

    async hasRecoveryKey(idpUrl: string, accessToken: string): Promise<boolean> {
        const blob = await this.directory.getRecoveryBlob(idpUrl, accessToken)
        return blob !== null
    }

    async clearRecoveryKey(idpUrl: string, accessToken: string): Promise<void> {
        // Server delete first — the local wipe is harmless even if the
        // server call later fails (the user can still recover by
        // re-typing whatever they have written down, against the now-
        // stale server blob… which won't exist). Order-wise, deleting
        // the server blob is the user-meaningful side effect; the
        // local copy is a UX-only artifact.
        await this.directory.deleteRecoveryBlob(idpUrl, accessToken)
        await this.storage.clearRecoveryPassphrase()
    }

    async getOwnFingerprint(): Promise<Fingerprint | null> {
        const k = await this.storage.loadIdentityKeypair()
        return k ? this.identity.fingerprint(k.msk_public) : null
    }

    async getPeerFingerprint(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<Fingerprint | null> {
        const resp = await this.directory.getIdentity(idpUrl, accessToken, actorUri)
        if (!resp) return null
        // Validate the SSK + USK signature chain before trusting the
        // MSK we're about to fingerprint. A peer IdP that returned a
        // bogus row would fail this check and we'd surface null
        // rather than display a fingerprint nobody can verify.
        if (!this.identity.validatePublicKeys(resp.keys)) {
            return null
        }
        return this.identity.fingerprint(resp.keys.msk_public)
    }

    async replenishKeyPackages(
        idpUrl: string,
        accessToken: string,
    ): Promise<KeyPackageStatusResponse> {
        const status = await this.directory.getKeyPackageStatus(idpUrl, accessToken)
        const deviceId = await this.storage.getOrCreateDeviceId()
        const myDevice = status.devices.find((d) => d.device_id === deviceId)

        // Either we've never published any (first run) or the server
        // has flagged us — both refill to the cap. The
        // `INITIAL_KEY_PACKAGE_BATCH` we use on register is half-cap;
        // a refill tops up to the full server-reported max.
        const needsFirstStash = !myDevice
        const needsRefill = myDevice?.needs_refill ?? false
        if (!needsFirstStash && !needsRefill) return status

        const have = myDevice?.available ?? 0
        const refillCount = Math.max(0, status.cap - have)
        if (refillCount === 0) return status

        await this.uploadKeyPackageBatch(idpUrl, accessToken, deviceId, refillCount)
        return this.directory.getKeyPackageStatus(idpUrl, accessToken)
    }

    private async uploadKeyPackageBatch(
        idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
        count: number,
    ): Promise<void> {
        if (count <= 0) return
        const expiresAtIso = new Date(Date.now() + DEFAULT_KEY_PACKAGE_LIFETIME_MS).toISOString()
        const packages = Array.from({ length: count }, () => ({
            key_package: this.mls.createKeyPackage(),
            expires_at: expiresAtIso,
        }))
        await this.directory.uploadKeyPackages(idpUrl, accessToken, deviceId, packages)
        // createKeyPackage writes per-bundle key material into the
        // provider's storage; persist so unconsumed KPs survive a
        // reload.
        await this.persistMlsState()
    }

    async encryptOutbound(
        conversationId: ConversationId,
        message: ApplicationMessage,
    ): Promise<Uint8Array> {
        const plaintext = new TextEncoder().encode(
            JSON.stringify(message, applicationMessageReplacer),
        )
        const out = this.mls.encryptApplication(conversationId, plaintext)
        // encrypt_application advances the send-side ratchet — must
        // persist or the next reload would reuse the same generation
        // and produce duplicate (and detectable) ciphertexts.
        await this.persistMlsState()
        return out
    }

    async decryptInbound(
        conversationId: ConversationId,
        ciphertext: Uint8Array,
        catchUp?: { idpUrl: string; accessToken: string },
    ): Promise<ApplicationMessage | null> {
        try {
            const out = this.processOnce(conversationId, ciphertext)
            // process_message advances the recv-side ratchet (and
            // applies commits in-place when the message is one);
            // persist so the next reload doesn't replay it.
            await this.persistMlsState()
            return out
        } catch (firstError) {
            // Catch-up retry: pull missing commits from the DS, replay
            // them through MLS, then retry the original ciphertext
            // once. Idempotent — duplicate commits hit the unique
            // index server-side, and openmls's `processMessage` is a
            // no-op for already-applied commits.
            if (!catchUp) throw firstError
            try {
                await this.catchUpCommits(catchUp.idpUrl, catchUp.accessToken, conversationId)
                const out = this.processOnce(conversationId, ciphertext)
                await this.persistMlsState()
                return out
            } catch (secondError) {
                // eslint-disable-next-line no-console
                console.warn(
                    `decryptInbound: catch-up retry failed for ${conversationId}`,
                    { firstError, secondError },
                )
                throw secondError
            }
        }
    }

    private processOnce(
        conversationId: ConversationId,
        ciphertext: Uint8Array,
    ): ApplicationMessage | null {
        const outcome = this.mls.processMessage(conversationId, ciphertext)
        if (outcome.kind !== "application") return null
        const text = new TextDecoder().decode(outcome.plaintext)
        return JSON.parse(text, applicationMessageReviver) as ApplicationMessage
    }

    /**
     * Pull every commit `> our local epoch` from the DS and replay it.
     * Caps at one round of pagination today — `has_more` follow-ups
     * land if/when long-offline reconnects become a real workflow.
     */
    private async catchUpCommits(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
    ): Promise<void> {
        if (!this.mls.hasGroup(conversationId)) {
            // Nothing to catch up to — caller is missing the founding
            // welcome. The decrypt will continue to fail; the WS
            // `mls_welcome_ready` event eventually delivers the
            // welcome and the next inbound message decrypts cleanly.
            return
        }
        const sinceEpoch = Number(this.mls.getEpoch(conversationId))
        const { commits } = await this.directory.getCommitsSince(
            idpUrl,
            accessToken,
            conversationId,
            sinceEpoch,
        )
        for (const c of commits) {
            try {
                this.mls.processMessage(conversationId, c.commit_blob)
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn(
                    `catchUpCommits: failed to apply commit at epoch ${c.epoch} for ${conversationId}`,
                    e,
                )
            }
        }
    }

    async addContactToGroup(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        actorUri: ActorUri,
    ): Promise<void> {
        // Pre-check first-message: if there's no MLS group yet, found
        // it before adding. The first sender always founds.
        const isFirstMessage = !this.mls.hasGroup(conversationId)
        if (isFirstMessage) {
            this.mls.createGroup(conversationId)
        }

        // Pass `null` for device_id — the IdP's claim endpoint picks
        // any device with spare KeyPackages and tells us which leaf
        // it claimed from (so we can target the Welcome correctly).
        const claimed = await this.directory.claimKeyPackage(
            idpUrl,
            accessToken,
            actorUri,
            null,
        )
        const out = this.mls.addMember(conversationId, claimed.key_package)

        // For a fresh group, the founding commit lives at epoch 0
        // (the create's implicit one). The very first commit we
        // generate via add_member moves us to epoch 1. Server's
        // unique index prevents duplicates; 409 races land in 5d.
        const epoch = Number(this.mls.getEpoch(conversationId)) + 1
        await this.directory.postCommit(idpUrl, accessToken, conversationId, epoch, out.commit)

        // Hand the welcome to our own IdP and let it route. Same-IdP
        // recipients land via `mls_welcomes` + a `MlsWelcomeReady` WS
        // push; remote recipients ride a signed AP `Create{Note}` with
        // `mlsKind: welcome` to the recipient IdP's inbox. The local
        // commit log + the (5d.1) cross-IdP claim proxy mean the
        // browser never has to know which side the recipient lives on.
        await this.directory.postWelcome(idpUrl, accessToken, {
            recipient_actor_uri: actorUri,
            recipient_device_id: claimed.device_id,
            conversation_id: conversationId,
            welcome_blob: out.welcome,
        })

        this.mls.mergePendingCommit(conversationId)
        // Group bootstrap is a multi-step state mutation; persist
        // once at the end instead of on every intermediate step.
        await this.persistMlsState()
    }

    async ensureGroupExists(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        recipientActorUri: ActorUri,
    ): Promise<void> {
        // Provider/snapshot only — the local identity must already be
        // bound via the onboarding bootstrap or `useConsumeMlsWelcomes`
        // before this path runs. Don't pass `recipientActorUri`
        // through ensureInitialized: that would stamp this device's
        // MLS leaf credential with the **peer's** actor URI on a fresh
        // device that somehow reached this path before login bootstrap
        // landed.
        await this.ensureInitialized(null)
        if (this.mls.hasGroup(conversationId)) return
        await this.addContactToGroup(idpUrl, accessToken, conversationId, recipientActorUri)
    }

    async consumePendingWelcomes(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ joined: number }> {
        await this.ensureInitialized(actorUri)
        const deviceId = await this.storage.getOrCreateDeviceId()
        const welcomes = await this.directory.getWelcomes(idpUrl, accessToken, deviceId)
        let joined = 0
        for (const w of welcomes) {
            if (this.mls.hasGroup(w.conversation_id)) continue
            try {
                // Welcomes carry the ratchet tree via the extension
                // (we set `use_ratchet_tree_extension(true)` on group
                // creation), so passing `null` here is correct.
                this.mls.joinGroup(w.conversation_id, w.welcome_blob, null)
                joined++
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn(`Failed to join group ${w.conversation_id} from welcome:`, e)
            }
        }
        if (joined > 0) await this.persistMlsState()
        return { joined }
    }

    // ─── Recovery Key ─────────────────────────────────────────────────

    async setupRecoveryKey(
        idpUrl: string,
        accessToken: string,
        passphrase: string,
    ): Promise<void> {
        if (passphrase.length < 8) {
            // The UI's strength meter does the heavy lifting; this is
            // a last-line guard for callers that bypass it.
            throw new Error("Recovery passphrase must be at least 8 characters")
        }
        const keypair = await this.storage.loadIdentityKeypair()
        if (!keypair) {
            throw new Error("Cannot set up Recovery Key before registering an identity")
        }
        const blob = await this.recovery.wrap(keypair.msk_private, passphrase)
        await this.directory.putRecoveryBlob(idpUrl, accessToken, blob)
    }

    async recoverFromPassphrase(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        passphrase: string,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint }> {
        const blob = await this.directory.getRecoveryBlob(idpUrl, accessToken)
        if (!blob) {
            throw new Error("No Recovery Key configured for this account")
        }
        const mskPrivate = await this.recovery.unwrap(blob, passphrase)

        // The wrapped blob carries only MSK private. SSK + USK are
        // regenerated fresh on every recovery (per spec § 9: "Restores
        // MSK locally. Generates fresh device leaf, signs with restored
        // SSK"). MSK signs the new SSK + USK so the chain stays
        // unbroken; the published identity row is overwritten on the
        // server, peers see the same MSK fingerprint and never trip
        // the identity-change warning.
        const restored = this.identity.recoverFromMsk(mskPrivate)
        await this.storage.saveIdentityKeypair(restored)
        await this.directory.publishIdentity(
            idpUrl,
            accessToken,
            this.identity.publicKeys(restored),
        )

        // Bind the device to this actor URI — same purpose as in
        // register(): the gate uses it to detect cross-account
        // contamination on subsequent mounts.
        await this.storage.setBoundActorUri(actorUri)

        // Bring the fresh device's MLS Identity online + seed its
        // KeyPackage stash so peers can add it to groups.
        await this.ensureInitialized(actorUri)
        const deviceId = await this.storage.getOrCreateDeviceId()
        await this.uploadKeyPackageBatch(idpUrl, accessToken, deviceId, INITIAL_KEY_PACKAGE_BATCH)

        return {
            device_id: deviceId,
            fingerprint: this.identity.fingerprint(restored.msk_public),
        }
    }

    // ─── Pairing ──────────────────────────────────────────────────────

    async startPairingAsInitiator(): Promise<{
        qr_payload: string
        spake_message: Uint8Array
        finalize: (
            responderMessage: Uint8Array,
            responderConfirmation: Uint8Array,
        ) => Promise<{ our_confirmation: Uint8Array; sealed_bundle: Uint8Array }>
    }> {
        const keypair = await this.storage.loadIdentityKeypair()
        if (!keypair) {
            throw new Error("Cannot start pairing — this device has no identity registered")
        }
        const initiator = PairingInitiator.start(keypair)
        return {
            qr_payload: JSON.stringify(initiator.qrPayload),
            spake_message: initiator.ourSpakeMessage,
            finalize: async (responderMessage, responderConfirmation) => {
                const reply = initiator.finalize(responderMessage, responderConfirmation)
                return {
                    our_confirmation: reply.ourConfirmation,
                    sealed_bundle: reply.sealedBundle,
                }
            },
        }
    }

    async pairAsResponder(
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
    }> {
        const responder = PairingResponder.fromQr(qrPayload, initiatorSpakeMessage)
        return {
            spake_message: responder.ourSpakeMessage,
            our_confirmation: responder.ourConfirmation,
            finalize: async (initiatorConfirmation, sealedBundle) => {
                const recovered = responder.finalize(initiatorConfirmation, sealedBundle)
                await this.storage.saveIdentityKeypair(recovered)

                // The pairing inherited an existing user's identity —
                // republishing isn't required (peers see the same MSK +
                // existing SSK signature), but seeding this device's
                // KeyPackage stash IS required so peers can add this
                // device to their groups.
                await this.ensureInitialized(actorUri)
                const deviceId = await this.storage.getOrCreateDeviceId()
                await this.uploadKeyPackageBatch(
                    idpUrl,
                    accessToken,
                    deviceId,
                    INITIAL_KEY_PACKAGE_BATCH,
                )

                return {
                    device_id: deviceId,
                    fingerprint: this.identity.fingerprint(recovered.msk_public),
                }
            },
        }
    }

    // ─── Device revocation (Phase 5 follow-up) ────────────────────────

    async revokeDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        deviceId: DeviceId,
        conversationIds: ConversationId[],
        opts?: { also_clear_recovery?: boolean },
    ): Promise<{ removed_from: ConversationId[] }> {
        await this.ensureInitialized(actorUri)

        const removed: ConversationId[] = []
        for (const conversationId of conversationIds) {
            // Skip groups we don't have local state for — those would
            // be conversations we joined under a different device.
            if (!this.mls.hasGroup(conversationId)) continue

            const leafIndex = this.mls.findLeafByDeviceId(conversationId, actorUri, deviceId)
            if (leafIndex == null) continue

            try {
                const commit = this.mls.removeMember(conversationId, leafIndex)
                const epoch = Number(this.mls.getEpoch(conversationId)) + 1
                await this.directory.postCommit(idpUrl, accessToken, conversationId, epoch, commit)
                this.mls.mergePendingCommit(conversationId)
                removed.push(conversationId)
                await this.persistMlsState()
            } catch (e) {
                // Per-group failure shouldn't block the rest. Common
                // case: 409 (someone else committed at this epoch);
                // Phase 5d's catch-up retry would be a natural follow-up.
                // eslint-disable-next-line no-console
                console.warn(`revokeDevice: per-group commit failed for ${conversationId}`, e)
            }
        }

        if (opts?.also_clear_recovery) {
            try {
                await this.directory.deleteRecoveryBlob(idpUrl, accessToken)
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("revokeDevice: clearing recovery blob failed:", e)
            }
        }

        return { removed_from: removed }
    }
}
