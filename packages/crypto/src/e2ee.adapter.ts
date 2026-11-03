/**
 * Top-level `IE2eePort` implementation. Wires the MLS engine, the encrypted
 * IndexedDB store, the IdP REST surface, the JWKS / attestation chain, and
 * the history-archive crypto + transport into the operations the rest of
 * the app calls.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { equalBytes } from "@noble/curves/utils.js"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import type {
    ActorUri,
    ApplicationMessage,
    ClaimedKeyPackage,
    ConversationId,
    DeviceId,
    Fingerprint,
    KeyPackageStatusResponse,
} from "@pinai/domain/models/e2ee"
import { KeyPackageUnavailable, devicesToAdd, leavesToRemove } from "@pinai/domain/models/group"
import { instanceOrigin } from "@pinai/domain/models/identity"
import {
    admitsClaim,
    sameCredential,
    untrustedLeaf,
    type LeafClaim,
    type LeafCredential,
    type LeafVerdict,
    type MlsLeaf,
    type UntrustedLeaf,
} from "@pinai/domain/models/leaf-trust"
import {
    ARCHIVE_UPLOAD_LIMIT,
    decodeArchiveEnvelope,
    encodeArchiveEnvelope,
    type ArchiveEnvelope,
    type ArchivedEntry,
} from "@pinai/domain/models/history-archive"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { IHistoryArchivePort } from "@pinai/domain/ports/history-archive.port"
import type { HpkeKeyPair, IHpkePort } from "@pinai/domain/ports/hpke.port"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"

import { verifyLeafCredential } from "./attestation-chain.adapter"
import { attestationBytes, deviceHpkeKeyBytes, leafBindingBytes } from "./canonical-bytes"
import type { HistoryArchiveAdapter } from "./history-archive.adapter"
import type { IdentityAdapter } from "./identity.adapter"
import type { IKeyDirectoryPort } from "@pinai/domain/ports/key-directory.port"
import type { IMlsEngine } from "@pinai/domain/ports/mls-engine.port"
import { PairingInitiator, PairingResponder } from "./pairing.adapter"
import type { RecoveryAdapter } from "./recovery.adapter"
import type { DeviceAttestation, E2eeStorage } from "./sealed-storage"

/** Renew the Device Root Key attestation silently when within this window of expiry. */
const ATTESTATION_RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function attestationNeedsRenewal(att: DeviceAttestation): boolean {
    const expires = Date.parse(att.expires_at)
    if (Number.isNaN(expires)) return true
    return expires - Date.now() < ATTESTATION_RENEWAL_WINDOW_MS
}

function storedHpkeKey(pair: HpkeKeyPair): NonNullable<DeviceAttestation["hpke"]> {
    return { public_key: pair.publicKey, private_key: pair.privateKey }
}

/**
 * Default lifetime for a freshly-built KeyPackage, in milliseconds.
 * Mirrors the IdP's `E2EE_KEYPACKAGE_LIFETIME_SECS` default (30 days). The
 * IdP brings an expiry beyond its lifetime, or already past, back within
 * it by its own clock, so this device's clock being off is harmless.
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

/** How many epoch races a prune loses before it gives up for now. */
const MAX_EPOCH_CONFLICTS = 5

// A batch the IdP refuses would be refused again, and hold up every entry queued behind it.
function refusedForGood(error: unknown): boolean {
    return (
        error instanceof IdpError &&
        error.status >= 400 &&
        error.status < 500 &&
        ![401, 408, 429].includes(error.status)
    )
}

export class E2eeAdapter implements IE2eePort {
    private readonly identity: IdentityAdapter
    private readonly mls: IMlsEngine
    private readonly storage: E2eeStorage
    private readonly directory: IKeyDirectoryPort
    private readonly recovery: RecoveryAdapter
    private readonly hpke: IHpkePort
    private readonly jwks: IJwksCachePort
    // Optional — when null, the per-decrypt archive buffer is a no-op.
    // IoC provides these in production; tests can omit.
    private readonly historyArchive: IHistoryArchivePort | null
    private readonly historyCrypto: HistoryArchiveAdapter | null

    constructor(
        identity: IdentityAdapter,
        mls: IMlsEngine,
        storage: E2eeStorage,
        directory: IKeyDirectoryPort,
        recovery: RecoveryAdapter,
        hpke: IHpkePort,
        jwks: IJwksCachePort,
        historyArchive: IHistoryArchivePort | null = null,
        historyCrypto: HistoryArchiveAdapter | null = null,
    ) {
        this.identity = identity
        this.mls = mls
        this.storage = storage
        this.directory = directory
        this.recovery = recovery
        this.hpke = hpke
        this.jwks = jwks
        this.historyArchive = historyArchive
        this.historyCrypto = historyCrypto
    }

    // ─── Device Root Key attestation ─────────────────────────────────

    private registerDevicePromise: Promise<void> | null = null

    async registerDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<void> {
        // Dedupe concurrent callers (gate + bootstrap usecase under StrictMode).
        if (this.registerDevicePromise) return this.registerDevicePromise
        this.registerDevicePromise = this.doRegisterDevice(idpUrl, accessToken, actorUri)
        try {
            await this.registerDevicePromise
        } finally {
            this.registerDevicePromise = null
        }
    }

    private async doRegisterDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<void> {
        const existing = await this.storage.loadDeviceAttestation()
        // A device without its HPKE key registers again at once, whatever the renewal window says.
        if (existing?.hpke && !attestationNeedsRenewal(existing)) return
        const rootKey = existing
            ? { secretKey: existing.drk_private, publicKey: existing.drk_public }
            : ed25519.keygen()
        const hpke = existing?.hpke ?? storedHpkeKey(await this.hpke.generateKeyPair())

        const deviceId = await this.storage.getOrCreateDeviceId()
        const hpkeSignature = ed25519.sign(deviceHpkeKeyBytes(actorUri, deviceId, hpke.public_key), rootKey.secretKey)
        const response = await this.directory.registerDevice(idpUrl, accessToken, deviceId, rootKey.publicKey, {
            publicKey: hpke.public_key,
            signature: hpkeSignature,
        })
        // Leaf credentials carry the expiry as text, rebuilt by every peer: it must be what was signed.
        const rebuilt = attestationBytes(actorUri, deviceId, rootKey.publicKey, response.expires_at, response.kid)
        if (!equalBytes(rebuilt, response.signed_message)) {
            throw new Error("The IdP's attestation isn't over this device's root key and expiry")
        }
        await this.storage.saveDeviceAttestation({
            drk_public: rootKey.publicKey,
            drk_private: rootKey.secretKey,
            signature: response.signature,
            kid: response.kid,
            issued_at: response.issued_at,
            expires_at: response.expires_at,
            signed_message: response.signed_message,
            hpke,
        })
        // The next KeyPackages carry the attestation just made, and the leaves take it.
        this.attestationVersion++
        this.identityBound = false
        for (const listener of this.registeredListeners) {
            try {
                listener()
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("onDeviceRegistered listener failed:", e)
            }
        }
    }

    private readonly registeredListeners = new Set<() => void>()

    onDeviceRegistered(listener: () => void): () => void {
        this.registeredListeners.add(listener)
        return () => this.registeredListeners.delete(listener)
    }

    /** The credential a leaf of this device carries over `signatureKey`: `identity-provider/specs/e2ee.md § 3.4`. */
    private leafCredential(
        actorUri: ActorUri,
        deviceId: DeviceId,
        attestation: DeviceAttestation,
        signatureKey: Uint8Array,
    ): LeafCredential {
        const issuer = instanceOrigin(actorUri)
        if (!issuer) throw new Error(`Not an actor URI: ${actorUri}`)
        const binding = ed25519.sign(leafBindingBytes(actorUri, deviceId, signatureKey), attestation.drk_private)
        return {
            v: 2,
            actor_uri: actorUri,
            device_id: deviceId,
            drk_pub: bytesToBase64(attestation.drk_public),
            idp_att: {
                issuer,
                kid: attestation.kid,
                expires_at: attestation.expires_at,
                signature: bytesToBase64(attestation.signature),
            },
            leaf_binding: bytesToBase64(binding),
        }
    }

    // ─── Leaf checks ──────────────────────────────────────────────────

    /** A claimed KeyPackage's leaf: `identity-provider/specs/e2ee.md § 3.4`, and the device it was claimed for. */
    private async checkClaim(actorUri: ActorUri, claim: ClaimedKeyPackage): Promise<LeafVerdict> {
        let leaf: LeafClaim
        try {
            leaf = await this.mls.inspectKeyPackage(claim.key_package)
        } catch {
            return { ok: false, reason: "malformed" }
        }
        return admitsClaim(await verifyLeafCredential(leaf, this.jwks), actorUri, claim.device_id)
    }

    /** By conversation and leaf index; each holds while the group holds that leaf as recorded. */
    private readonly untrustedLeaves = new Map<string, { leaf: UntrustedLeaf; fingerprint: string }>()
    private readonly untrustedLeafListeners = new Set<(leaf: UntrustedLeaf) => void>()

    onUntrustedLeaf(listener: (leaf: UntrustedLeaf) => void): () => void {
        this.untrustedLeafListeners.add(listener)
        for (const { leaf } of this.untrustedLeaves.values()) tell(listener, leaf)
        return () => this.untrustedLeafListeners.delete(listener)
    }

    /**
     * Every leaf met in a group — a Welcome's tree, a commit bringing one in or replacing one — is
     * checked; one failing is recorded and announced, never thrown: the group is the members', and
     * what to do about it is the listeners'.
     */
    private async checkLeavesMet(conversationId: ConversationId, met: readonly MlsLeaf[]): Promise<void> {
        await this.forgetLeavesGone(conversationId)
        for (const leaf of met) {
            if (leaf.own) continue
            const key = `${conversationId}:${leaf.leafIndex}`
            const fingerprint = leafFingerprint(leaf)
            if (this.untrustedLeaves.get(key)?.fingerprint === fingerprint) continue
            const verdict = await verifyLeafCredential(leaf, this.jwks)
            // An issuer out of reach says nothing of the leaf: it is checked again when next met.
            if (verdict.ok || verdict.reason === "unreachable") {
                this.untrustedLeaves.delete(key)
                continue
            }
            const record = untrustedLeaf(conversationId, leaf, verdict.reason)
            this.untrustedLeaves.set(key, { leaf: record, fingerprint })
            // eslint-disable-next-line no-console
            console.warn(`[e2ee] a leaf in ${conversationId} fails its checks (${verdict.reason})`, record)
            for (const listener of this.untrustedLeafListeners) tell(listener, record)
        }
    }

    /** Drops the records of a group's leaves that left it or changed. */
    private async forgetLeavesGone(conversationId: ConversationId): Promise<void> {
        const recorded = [...this.untrustedLeaves].filter(([, { leaf }]) => leaf.conversationId === conversationId)
        if (recorded.length === 0) return
        const held = (await this.mls.hasGroup(conversationId)) ? await this.mls.groupLeaves(conversationId) : []
        for (const [key, { leaf, fingerprint }] of recorded) {
            if (!held.some((h) => h.leafIndex === leaf.leafIndex && leafFingerprint(h) === fingerprint)) {
                this.untrustedLeaves.delete(key)
            }
        }
    }

    // ─── History-backup engine ────────────────────────────────────────

    private archiveBuffer: Array<{
        conversationId: ConversationId
        entryId: string
        plaintext: Uint8Array
    }> = []
    // A sent message is queued by the send's answer and by its echo, whichever comes first.
    private archivedIds = new Set<string>()
    private flushing: Promise<void> | null = null
    private flushTimer: ReturnType<typeof setInterval> | null = null
    private cachedHistoryArchiveKey: Uint8Array | null = null
    private flushIdpUrl: string | null = null
    private flushAccessToken: (() => string | null) | null = null

    bufferForArchive(conversationId: ConversationId, entryId: string, entry: ArchiveEnvelope): void {
        if (!this.historyArchive || !this.historyCrypto) return
        if (this.archivedIds.has(entryId)) return
        this.archivedIds.add(entryId)
        const plaintext = new TextEncoder().encode(encodeArchiveEnvelope(entry))
        this.archiveBuffer.push({ conversationId, entryId, plaintext })
        if (this.archiveBuffer.length >= 10) void this.flushArchiveNow()
    }

    startFlushing(idpUrl: string, accessToken: () => string | null): void {
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
        this.cachedHistoryArchiveKey = null
    }

    async getCachedPassphrase(): Promise<string[] | null> {
        return this.storage.loadRecoveryPassphrase()
    }

    async restoreHistoryFromPassphrase(
        idpUrl: string,
        accessToken: string,
        passphrase: string[],
    ): Promise<{ entries: ArchivedEntry[]; skipped: number }> {
        if (!this.historyArchive || !this.historyCrypto) {
            return { entries: [], skipped: 0 }
        }
        const salt = await this.historyArchive.getSalt(idpUrl, accessToken)
        if (!salt) return { entries: [], skipped: 0 }
        const historyArchiveKey = await this.historyCrypto.deriveKey(passphrase, salt)

        const entries: ArchivedEntry[] = []
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
                let plain: Uint8Array
                try {
                    plain = await this.historyCrypto.decrypt(
                        historyArchiveKey,
                        entry.ciphertext,
                        entry.nonce,
                    )
                } catch {
                    skipped += 1
                    continue
                }
                const envelope = decodeArchiveEnvelope(new TextDecoder().decode(plain))
                if (envelope) {
                    entries.push({ conversationId: entry.conversation_id, id: entry.id, envelope })
                }
            }
            cursor = page.next_cursor
        } while (cursor)
        return { entries, skipped }
    }

    async clearHistoryBackup(idpUrl: string, accessToken: string): Promise<void> {
        if (this.historyArchive) {
            await this.historyArchive.wipeArchive(idpUrl, accessToken)
        }
        await this.storage.clearRecoveryPassphrase()
        this.cachedHistoryArchiveKey = null
        this.archiveBuffer = []
        this.archivedIds.clear()
    }

    /** One drain at a time: the timer and a full buffer both ask for one. */
    private flushArchiveNow(): Promise<void> {
        this.flushing ??= this.drainArchive().finally(() => {
            this.flushing = null
        })
        return this.flushing
    }

    /** Derives the History Archive Key lazily; idle when no passphrase exists. */
    private async drainArchive(): Promise<void> {
        while (this.archiveBuffer.length > 0) {
            const idpUrl = this.flushIdpUrl
            const accessToken = this.flushAccessToken?.()
            if (!this.historyArchive || !this.historyCrypto || !idpUrl || !accessToken) return
            if (!this.cachedHistoryArchiveKey) {
                const phrase = await this.storage.loadRecoveryPassphrase()
                if (!phrase) return
                const salt = await this.historyArchive.getSalt(idpUrl, accessToken)
                if (!salt) return
                this.cachedHistoryArchiveKey = await this.historyCrypto.deriveKey(phrase, salt)
            }
            const key = this.cachedHistoryArchiveKey
            const sealer = this.historyCrypto
            const batch = this.archiveBuffer.splice(0, ARCHIVE_UPLOAD_LIMIT)
            try {
                const entries = await Promise.all(
                    batch.map(async (e) => {
                        const { ciphertext, nonce } = await sealer.encrypt(key, e.plaintext)
                        return { id: e.entryId, conversation_id: e.conversationId, ciphertext, nonce }
                    }),
                )
                await this.historyArchive.uploadBatch(idpUrl, accessToken, entries)
            } catch (err) {
                if (refusedForGood(err)) {
                    // eslint-disable-next-line no-console
                    console.warn("[history-archive] the IdP refused a batch; dropping it", err)
                    continue
                }
                // eslint-disable-next-line no-console
                console.warn("[history-archive] flush failed; re-buffering", err)
                this.archiveBuffer.unshift(...batch)
                return
            }
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
     * stamp this device's MLS leaf credential; callers without one at
     * hand pass the account the storage is bound to, never a peer's.
     * `null` skips the binding: for paths that make no KeyPackage and
     * found no group (catching up, pruning, refreshing a leaf). Nothing
     * is bound until the device has an attestation.
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
            const binding: Promise<void> = this.doBindIdentity(localActorUri).finally(() => {
                // A wipe may have dropped this bind for another meanwhile.
                if (this.identityBindPromise === binding) this.identityBindPromise = null
            })
            this.identityBindPromise = binding
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
            await this.mls.restoreStorage(snap.provider_state, snap.known_group_ids)
        } catch (e) {
            // Corrupt snapshot — boot from scratch. The welcome-poll
            // loop will eventually re-pull every group's MLS state
            // from the IdP.
            // eslint-disable-next-line no-console
            console.warn("MLS snapshot restore failed; starting fresh:", e)
        }
    }

    /**
     * Binds the credential this device's KeyPackages and founded groups carry, once it has an
     * attestation to put in it; until then nothing is bound, and the next call tries again.
     */
    private async doBindIdentity(localActorUri: ActorUri): Promise<void> {
        // A registration landing meanwhile brought another attestation: bound again with it.
        for (;;) {
            const version = this.attestationVersion
            const attestation = await this.storage.loadDeviceAttestation()
            if (!attestation) {
                if (version === this.attestationVersion) return
                continue
            }
            const deviceId = await this.storage.getOrCreateDeviceId()
            // A key one of the restored groups' leaves carries, so a reload doesn't mint one for
            // the next KeyPackages. Groups sign with their own leaf's key either way.
            const signatureKey = (await this.mls.ownLeafSignatureKey()) ?? (await this.mls.generateSignatureKey())
            await this.mls.setIdentity(this.leafCredential(localActorUri, deviceId, attestation, signatureKey), signatureKey)
            // A fresh key lives in the provider's storage only: the next reload must find it.
            await this.persistMlsState()
            if (version === this.attestationVersion) {
                this.identityBound = true
                return
            }
        }
    }

    private identityBound = false
    /** Moved by each registration: a bind that read the attestation before it is bound again. */
    private attestationVersion = 0
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
            await this.saveMlsState()
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("MLS snapshot save failed:", e)
        }
    }

    private async saveMlsState(): Promise<void> {
        const provider_state = await this.mls.serializeStorage()
        const known_group_ids = await this.mls.knownGroupIds()
        await this.storage.saveMlsSnapshot({ provider_state, known_group_ids })
    }

    async register(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint }> {
        // Dedupe concurrent callers — two StrictMode mounts would otherwise
        // each upload INITIAL_KEY_PACKAGE_BATCH KPs and overshoot the cap.
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
        // The root key and its attestation first: every KeyPackage's credential carries them.
        await this.registerDevice(idpUrl, accessToken, actorUri)
        await this.ensureInitialized(actorUri)

        const deviceId = await this.storage.getOrCreateDeviceId()
        let keypair = await this.storage.loadIdentityKeypair()

        if (!keypair) {
            keypair = this.identity.generate()
            await this.storage.saveIdentityKeypair(keypair)
            // Local-only — IdP attestation of the Device Root Key lands via
            // `registerDevice`, separately from this keypair.
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

        // Re-bootstrap idempotency: reusing the existing passphrase prevents
        // overwriting words the user already wrote down on paper.
        const existing = await this.storage.loadRecoveryPassphrase()
        if (existing && existing.length === 24) {
            return { device_id, fingerprint, words: existing }
        }

        const mnemonic = generateMnemonic(wordlist, 256)
        const words = mnemonic.split(" ")
        if (words.length !== 24) {
            throw new Error(`bootstrap: expected 24-word mnemonic, got ${words.length}`)
        }
        void mnemonic
        await this.storage.saveRecoveryPassphrase(words)

        // Salt for Argon2id History Archive Key derivation. Set-once on the server.
        if (this.historyArchive) {
            try {
                const salt = crypto.getRandomValues(new Uint8Array(16))
                await this.historyArchive.setSalt(idpUrl, accessToken, salt)
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("[bootstrap] history salt mint failed (non-fatal)", e)
            }
        }
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
        this.attestationVersion++
        this.providerInitPromise = null
        this.identityBindPromise = null
        this.registerPromise = null
        this.bootstrapPromise = null
        await this.mls.resetProvider()
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

    private replenishPromise: Promise<KeyPackageStatusResponse> | null = null

    async replenishKeyPackages(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<KeyPackageStatusResponse> {
        // Entry, timer and push may overlap: two runs would read the same count and overshoot the cap.
        if (this.replenishPromise) return this.replenishPromise
        this.replenishPromise = this.doReplenishKeyPackages(idpUrl, accessToken, actorUri)
        try {
            return await this.replenishPromise
        } finally {
            this.replenishPromise = null
        }
    }

    private async doReplenishKeyPackages(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<KeyPackageStatusResponse> {
        // A KeyPackage made before the snapshot restore would lose its private half to it.
        await this.ensureInitialized(actorUri)
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
        // A renewal since the caller bound leaves nothing bound: bound again, with the new attestation.
        if (!this.identityBound) await this.ensureInitialized(await this.storage.getBoundActorUri())
        if (!this.identityBound) throw new Error("This device isn't registered yet: its KeyPackages wait for its attestation")
        const expiresAtIso = new Date(Date.now() + DEFAULT_KEY_PACKAGE_LIFETIME_MS).toISOString()
        // Sequential on purpose: every createKeyPackage writes bundle key
        // material into the provider's storage, so they must not interleave.
        const packages: { key_package: Uint8Array; expires_at: string }[] = []
        for (let i = 0; i < count; i++) {
            packages.push({
                key_package: await this.mls.createKeyPackage(),
                expires_at: expiresAtIso,
            })
        }
        // Saved before they're published, and not published unsaved: a package the server hands
        // out must be one this device can still open after a reload.
        await this.saveMlsState()
        await this.directory.uploadKeyPackages(idpUrl, accessToken, deviceId, packages)
    }

    async encryptOutbound(
        conversationId: ConversationId,
        message: ApplicationMessage,
    ): Promise<Uint8Array> {
        const plaintext = new TextEncoder().encode(
            JSON.stringify(message, applicationMessageReplacer),
        )
        const out = await this.mls.encryptApplication(conversationId, plaintext)
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
            const out = await this.processOnce(conversationId, ciphertext)
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
                await this.inGroup(conversationId, () =>
                    this.catchUpCommits(catchUp.idpUrl, catchUp.accessToken, conversationId),
                )
                const out = await this.processOnce(conversationId, ciphertext)
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

    private async processOnce(
        conversationId: ConversationId,
        ciphertext: Uint8Array,
    ): Promise<ApplicationMessage | null> {
        const outcome = await this.mls.processMessage(conversationId, ciphertext)
        if (outcome.kind === "commit") await this.checkLeavesMet(conversationId, outcome.leavesMet)
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
        if (!(await this.mls.hasGroup(conversationId))) {
            // Nothing to catch up to — caller is missing the founding
            // welcome. The decrypt will continue to fail; the WS
            // `mls_welcome_ready` event eventually delivers the
            // welcome and the next inbound message decrypts cleanly.
            return
        }
        const sinceEpoch = Number(await this.mls.getEpoch(conversationId))
        const { commits } = await this.directory.getCommitsSince(
            idpUrl,
            accessToken,
            conversationId,
            sinceEpoch,
        )
        for (const c of commits) {
            try {
                const outcome = await this.mls.processMessage(conversationId, c.commit_blob)
                if (outcome.kind === "commit") await this.checkLeavesMet(conversationId, outcome.leavesMet)
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
        // A group founded here carries this device's credential: the one bound to its account.
        await this.ensureInitialized(await this.storage.getBoundActorUri())
        await this.inGroup(conversationId, () =>
            this.doAddContactToGroup(idpUrl, accessToken, conversationId, actorUri),
        )
    }

    private async doAddContactToGroup(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        actorUri: ActorUri,
    ): Promise<void> {
        // No MLS group yet: this device founds it. The first sender always founds.
        const isFirstMessage = !(await this.mls.hasGroup(conversationId))

        // One KeyPackage of each of their devices: a group holding only the device a single
        // claim picks leaves their others reading nothing until a sibling of theirs adds them.
        let claims: ClaimedKeyPackage[]
        try {
            claims = await this.directory.claimEachDevice(idpUrl, accessToken, actorUri)
        } catch (e) {
            // Nothing committed yet: the caller may take the invitee off the group cleanly.
            throw new KeyPackageUnavailable(actorUri, e)
        }
        // A leaf failing its checks is never added; a device of theirs left out waits for its siblings.
        const claimed: ClaimedKeyPackage[] = []
        for (const claim of claims) {
            const verdict = await this.checkClaim(actorUri, claim)
            if (verdict.ok) claimed.push(claim)
            // eslint-disable-next-line no-console
            else console.warn(`addContactToGroup: a KeyPackage of ${claim.device_id} refused (${verdict.reason})`)
        }
        if (claimed.length === 0) {
            const why = claims.length === 0 ? "no device with a KeyPackage" : "no KeyPackage whose leaf verifies"
            throw new KeyPackageUnavailable(actorUri, new Error(why))
        }
        if (isFirstMessage) await this.mls.createGroup(conversationId)
        let added = 0
        for (const keyPackage of claimed) {
            try {
                await this.addClaimed(idpUrl, accessToken, conversationId, actorUri, keyPackage)
                added++
            } catch (e) {
                // The first is the add itself, whose failure is the caller's. A later device of
                // theirs is brought in by its siblings once one of them holds the group.
                if (added === 0) {
                    // Founded here, it holds only this device — most likely another one founded
                    // the group first. Kept, it would take what this device sends, and nobody
                    // would read it; dropped, the next send fails until a Welcome brings it in.
                    if (isFirstMessage) await this.forgetFoundedGroup(conversationId)
                    throw e
                }
                // eslint-disable-next-line no-console
                console.warn(`addContactToGroup: device ${keyPackage.device_id} left to its siblings`, e)
            }
        }
        if (isFirstMessage) this.announceGroupHeld(conversationId)
    }

    private async forgetFoundedGroup(conversationId: ConversationId): Promise<void> {
        await this.mls.deleteGroup(conversationId)
        await this.persistMlsState()
        await this.forgetLeavesGone(conversationId)
    }

    /** One device into the group: a commit of its own, then its Welcome. */
    private async addClaimed(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        actorUri: ActorUri,
        claimed: ClaimedKeyPackage,
    ): Promise<void> {
        const out = await this.mls.addMember(conversationId, claimed.key_package)
        const epoch = Number(await this.mls.getEpoch(conversationId)) + 1
        try {
            await this.directory.postCommit(idpUrl, accessToken, conversationId, epoch, out.commit)
        } catch (e) {
            // A commit left pending would block the group's next one, this add tried again included.
            await this.mls.clearPendingCommit(conversationId)
            throw e
        }
        await this.mls.mergePendingCommit(conversationId)
        await this.persistMlsState()
        // Our own IdP routes it: a local recipient's queue and push, or a signed AP
        // `Create{Note}` (`mlsKind: welcome`) to the recipient's instance.
        await this.directory.postWelcome(idpUrl, accessToken, {
            recipient_actor_uri: actorUri,
            recipient_device_id: claimed.device_id,
            conversation_id: conversationId,
            welcome_blob: out.welcome,
        })
    }

    async ensureGroupExists(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        recipientActorUri: ActorUri,
    ): Promise<void> {
        // The account this device's storage is bound to, never `recipientActorUri`: that would
        // stamp this device's leaf credential with the peer's actor URI.
        await this.ensureInitialized(await this.storage.getBoundActorUri())
        // Checked in the same run as the founding, so two sends at once found it once.
        await this.inGroup(conversationId, async () => {
            if (await this.mls.hasGroup(conversationId)) return
            await this.doAddContactToGroup(idpUrl, accessToken, conversationId, recipientActorUri)
        })
    }

    async consumePendingWelcomes(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ joined: number }> {
        await this.ensureInitialized(actorUri)
        const deviceId = await this.storage.getOrCreateDeviceId()
        const welcomes = await this.directory.getWelcomes(idpUrl, accessToken, deviceId)
        const joined: ConversationId[] = []
        for (const w of welcomes) {
            try {
                const held = await this.inGroup(w.conversation_id, async () => {
                    let joined = true
                    if (await this.mls.hasGroup(w.conversation_id)) {
                        joined = await this.mls.rejoinGroup(w.conversation_id, w.welcome_blob)
                    } else {
                        // Every member's Welcome carries the ratchet tree (the
                        // extension, set on create and join), so `null` is correct.
                        await this.mls.joinGroup(w.conversation_id, w.welcome_blob, null)
                    }
                    if (joined) await this.checkLeavesMet(w.conversation_id, await this.mls.groupLeaves(w.conversation_id))
                    return joined
                })
                if (held) joined.push(w.conversation_id)
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn(`Failed to join group ${w.conversation_id} from welcome:`, e)
            }
        }
        if (joined.length > 0) await this.persistMlsState()
        for (const id of joined) this.announceGroupHeld(id)
        return { joined: joined.length }
    }

    private readonly groupHeldListeners = new Set<(conversationId: ConversationId) => void>()

    onGroupHeld(listener: (conversationId: ConversationId) => void): () => void {
        this.groupHeldListeners.add(listener)
        return () => this.groupHeldListeners.delete(listener)
    }

    private announceGroupHeld(conversationId: ConversationId): void {
        for (const listener of this.groupHeldListeners) {
            try {
                listener(conversationId)
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("onGroupHeld listener failed:", e)
            }
        }
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

    async pruneGroup(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        roster: readonly string[],
    ): Promise<{ removed: number }> {
        await this.ensureInitialized(null)
        return this.inGroup(conversationId, async () => {
            const me = await this.storage.getBoundActorUri()
            if (!me || !(await this.mls.hasGroup(conversationId))) return { removed: 0 }
            const removed = await this.commitEach(idpUrl, accessToken, conversationId, async () => {
                const leaves = (await this.mls.groupLeaves(conversationId))
                    .filter((leaf) => !leaf.own)
                    .map((leaf) => ({ leafIndex: leaf.leafIndex, actorUri: leaf.credential?.actor_uri ?? null }))
                const [leaf] = leavesToRemove(leaves, roster, me)
                return leaf === undefined ? null : { commit: await this.mls.removeMember(conversationId, leaf) }
            })
            return { removed }
        })
    }

    /**
     * Commits to a group this device holds the changes `next` builds, one a commit, `next` asked
     * again after each — it answers `null` when nothing is left: a commit moves the epoch, and one
     * lost to another member's may have done what was left. A commit losing its epoch (`409`) is
     * dropped and the group caught up, at most five times; any other failure drops it and throws.
     * How many were merged.
     */
    private async commitEach(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        next: () => Promise<{ commit: Uint8Array; merged?: () => Promise<unknown> } | null>,
    ): Promise<number> {
        let merged = 0
        let conflicts = 0
        for (;;) {
            const step = await next()
            if (!step) return merged
            const epoch = Number(await this.mls.getEpoch(conversationId)) + 1
            try {
                await this.directory.postCommit(idpUrl, accessToken, conversationId, epoch, step.commit)
            } catch (e) {
                await this.mls.clearPendingCommit(conversationId)
                if (!(e instanceof IdpError && e.status === 409) || ++conflicts > MAX_EPOCH_CONFLICTS) {
                    throw e
                }
                await this.catchUpCommits(idpUrl, accessToken, conversationId)
                continue
            }
            await this.mls.mergePendingCommit(conversationId)
            await this.persistMlsState()
            await this.forgetLeavesGone(conversationId)
            await step.merged?.()
            merged++
        }
    }

    async catchUp(idpUrl: string, accessToken: string, conversationId: ConversationId): Promise<void> {
        await this.ensureInitialized(null)
        await this.inGroup(conversationId, async () => {
            if (!(await this.mls.hasGroup(conversationId))) return
            const before = await this.mls.getEpoch(conversationId)
            await this.catchUpCommits(idpUrl, accessToken, conversationId)
            if ((await this.mls.getEpoch(conversationId)) !== before) await this.persistMlsState()
        })
    }

    private readonly groupRuns = new Map<ConversationId, Promise<void>>()

    /**
     * One change to a group's MLS state at a time. Each awaits the network between its steps, so
     * two interleaved would apply a commit — this device's own, pushed back by the DS — over the
     * one still pending.
     */
    private inGroup<T>(conversationId: ConversationId, run: () => Promise<T>): Promise<T> {
        const next = (this.groupRuns.get(conversationId) ?? Promise.resolve()).then(run)
        const settled = next.then(
            () => {},
            () => {},
        )
        this.groupRuns.set(conversationId, settled)
        void settled.then(() => {
            if (this.groupRuns.get(conversationId) === settled) this.groupRuns.delete(conversationId)
        })
        return next
    }

    async addOwnDevices(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        devices: readonly DeviceId[],
    ): Promise<{ added: number }> {
        // A device-list refresh and a group just held can start runs together; the second finds
        // what the first added.
        return this.inGroup(conversationId, () =>
            this.doAddOwnDevices(idpUrl, accessToken, conversationId, devices),
        )
    }

    private async doAddOwnDevices(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        devices: readonly DeviceId[],
    ): Promise<{ added: number }> {
        await this.ensureInitialized(null)
        const me = await this.storage.getBoundActorUri()
        if (!me || !(await this.mls.hasGroup(conversationId))) return { added: 0 }
        const unavailable = new Set<DeviceId>()
        const added = await this.commitEach(idpUrl, accessToken, conversationId, async () => {
            for (;;) {
                const [device] = devicesToAdd(await this.mls.groupMembers(conversationId), me, devices).filter(
                    (d) => !unavailable.has(d),
                )
                if (device === undefined) return null
                let claimed
                try {
                    claimed = await this.directory.claimKeyPackage(idpUrl, accessToken, me, device)
                } catch {
                    unavailable.add(device)
                    continue
                }
                if (claimed.device_id !== device) {
                    unavailable.add(device)
                    continue
                }
                const verdict = await this.checkClaim(me, claimed)
                if (!verdict.ok) {
                    // eslint-disable-next-line no-console
                    console.warn(`addOwnDevices: a KeyPackage of ${device} refused (${verdict.reason})`)
                    unavailable.add(device)
                    continue
                }
                const out = await this.mls.addMember(conversationId, claimed.key_package)
                return {
                    commit: out.commit,
                    merged: () =>
                        this.directory.postWelcome(idpUrl, accessToken, {
                            recipient_actor_uri: me,
                            recipient_device_id: device,
                            conversation_id: conversationId,
                            welcome_blob: out.welcome,
                        }),
                }
            }
        })
        return { added }
    }

    async refreshOwnLeaf(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
    ): Promise<{ refreshed: boolean }> {
        await this.ensureInitialized(null)
        return this.inGroup(conversationId, async () => {
            // A renewal under way brings the attestation the leaf must carry.
            await this.registerDevicePromise?.catch(() => undefined)
            const me = await this.storage.getBoundActorUri()
            const attestation = await this.storage.loadDeviceAttestation()
            if (!me || !attestation || !(await this.mls.hasGroup(conversationId))) return { refreshed: false }
            const deviceId = await this.storage.getOrCreateDeviceId()
            const commits = await this.commitEach(idpUrl, accessToken, conversationId, async () => {
                const own = (await this.mls.groupLeaves(conversationId)).find((leaf) => leaf.own)
                if (!own) return null
                const wanted = this.leafCredential(me, deviceId, attestation, own.signatureKey)
                if (sameCredential(own.credential, wanted)) return null
                return { commit: await this.mls.updateOwnCredential(conversationId, wanted) }
            })
            return { refreshed: commits > 0 }
        })
    }

    async forgetGroup(conversationId: ConversationId): Promise<void> {
        await this.ensureInitialized(null)
        await this.inGroup(conversationId, async () => {
            await this.mls.deleteGroup(conversationId)
            await this.persistMlsState()
            await this.forgetLeavesGone(conversationId)
        })
    }

    // ─── Device revocation ─────────────────────────────────────────────

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
            await this.inGroup(conversationId, async () => {
                // Skip groups we don't have local state for — those would
                // be conversations we joined under a different device.
                if (!(await this.mls.hasGroup(conversationId))) return

                // Every leaf naming the device, one a commit.
                for (;;) {
                    const leafIndex = await this.mls.findLeafByDeviceId(conversationId, actorUri, deviceId)
                    if (leafIndex == null) return
                    try {
                        const commit = await this.mls.removeMember(conversationId, leafIndex)
                        const epoch = Number(await this.mls.getEpoch(conversationId)) + 1
                        await this.directory.postCommit(idpUrl, accessToken, conversationId, epoch, commit)
                        await this.mls.mergePendingCommit(conversationId)
                        if (!removed.includes(conversationId)) removed.push(conversationId)
                        await this.persistMlsState()
                        await this.forgetLeavesGone(conversationId)
                    } catch (e) {
                        // A commit left pending would block the group's next one.
                        await this.mls.clearPendingCommit(conversationId).catch(() => {})
                        // Per-group failure (often 409 epoch race) shouldn't block the rest.
                        // eslint-disable-next-line no-console
                        console.warn(`revokeDevice: per-group commit failed for ${conversationId}`, e)
                        return
                    }
                }
            })
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

function tell(listener: (leaf: UntrustedLeaf) => void, leaf: UntrustedLeaf): void {
    try {
        listener(leaf)
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("onUntrustedLeaf listener failed:", e)
    }
}

/** A record is about this very leaf: its signature key and its credential as decoded. */
function leafFingerprint(leaf: MlsLeaf): string {
    return `${bytesToBase64(leaf.signatureKey)}:${JSON.stringify(leaf.credential)}`
}
