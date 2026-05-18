/**
 * Encrypted-at-rest IndexedDB persistence for the E2EE crypto core.
 *
 * Browser sandboxing protects IndexedDB from cross-origin reads, but
 * not from XSS in our own code. So every blob with private-key
 * material is encrypted with a per-device, non-extractable AES-256-GCM
 * key kept in the DB itself (`crypto.subtle.generateKey({extractable:
 * false})`) — an XSS can call us to *use* the key, but can never
 * exfiltrate it. CSP + auditing every third-party script we pull in is
 * the second half of the defence.
 *
 * Stores
 * - `meta`         : `{ device_id, device_key }` (the AES-GCM CryptoKey).
 * - `identity`     : `{ ciphertext, iv }` — encrypted MSK/SSK/USK bundle.
 * - `mls_snapshot` : `{ ciphertext, iv }` — encrypted blob containing
 *                    the openmls provider's KV state plus a list of
 *                    known conversation_ids. Restored on app boot
 *                    so MLS group state survives reload.
 */

import { type IDBPDatabase, openDB } from "idb"

import type {
    ActorUri,
    ConversationId,
    DeviceId,
    IdentityKeypair,
} from "@/domain/models/e2ee"

const DB_NAME = "pinai-e2ee"
// Upgrade callback is additive — existing rows survive each version bump.
const DB_VERSION = 4

const META_STORE = "meta"
const IDENTITY_STORE = "identity"
const GROUPS_STORE = "groups"
const MLS_SNAPSHOT_STORE = "mls_snapshot"
const RECOVERY_PASSPHRASE_STORE = "recovery_passphrase"
const DEVICE_ATTESTATION_STORE = "device_attestation"

const META_KEY = "current"
const IDENTITY_KEY = "current"
const MLS_SNAPSHOT_KEY = "current"
const RECOVERY_PASSPHRASE_KEY = "current"
const DEVICE_ATTESTATION_KEY = "current"

const AES_ALGORITHM: AesKeyAlgorithm = { name: "AES-GCM", length: 256 }
const AES_KEY_USAGES: KeyUsage[] = ["encrypt", "decrypt"]
const IV_BYTES = 12

interface MetaRow {
    device_id: DeviceId
    device_key: CryptoKey
    /**
     * Actor URI bound to this device's stored identity. The gate uses it
     * to detect "different user signed in on the same browser" and wipe.
     */
    bound_actor_uri?: ActorUri
}

interface SealedRow {
    ciphertext: ArrayBuffer
    iv: Uint8Array
}

/**
 * Plaintext shape we serialise to JSON before encrypting. JSON keeps
 * us out of the manual-tagging-bytes business; the encrypted payload
 * is small (~hundreds of bytes for one IdentityKeypair).
 */
interface IdentityKeypairJson {
    msk_public: number[]
    msk_private: number[]
    ssk_public: number[]
    ssk_private: number[]
    ssk_signature: number[]
    usk_public: number[]
    usk_private: number[]
    usk_signature: number[]
}

/**
 * Snapshot of the openmls provider's KV state plus a list of every
 * conversation we held an in-memory `Group` for at the moment of the
 * snapshot. Both fields go into one encrypted blob.
 */
export interface MlsSnapshot {
    /** Output of `Provider.serialize_storage()`. */
    provider_state: Uint8Array
    /** Conversation UUIDs to call `Group.load_from_provider` on. */
    known_group_ids: ConversationId[]
}

/**
 * Per-device Device Root Key + IdP attestation. `signed_message` is the
 * canonical bytes the IdP signed, kept so the client can locally re-verify
 * after restore.
 */
export interface DeviceAttestation {
    drk_public: Uint8Array
    drk_private: Uint8Array
    signature: Uint8Array
    kid: string
    issued_at: string  // RFC3339
    expires_at: string // RFC3339
    /** Canonical bytes the IdP signed — kept for local re-verification. */
    signed_message: Uint8Array
}

export interface E2eeStorage {
    /** Returns the device's UUID, generating + persisting on first call. */
    getOrCreateDeviceId(): Promise<DeviceId>
    /**
     * Returns the device's at-rest encryption key (non-extractable
     * AES-256-GCM `CryptoKey`), generating it lazily on first call.
     *
     * Shared with the Zustand `persist` middleware so the cached
     * plaintext-message store reuses the same key material rather
     * than minting a parallel one. An attacker with execution access
     * can call this adapter to use the key but can never lift the
     * raw bytes out (that's what `extractable: false` buys).
     */
    getOrCreateDeviceKey(): Promise<CryptoKey>
    /** Encrypted save. Replaces whatever was there. */
    saveIdentityKeypair(keypair: IdentityKeypair): Promise<void>
    /** Returns null if no identity has been registered on this device. */
    loadIdentityKeypair(): Promise<IdentityKeypair | null>
    /**
     * Persist the MLS provider snapshot. Encrypted under the device
     * key. Called after every state-changing MLS operation by the
     * `e2ee` adapter; replaces the previous row wholesale.
     */
    saveMlsSnapshot(snapshot: MlsSnapshot): Promise<void>
    /**
     * Returns the most recent persisted MLS snapshot, or `null` if
     * none has been stored yet (fresh device / cleared storage).
     */
    loadMlsSnapshot(): Promise<MlsSnapshot | null>
    /**
     * Persist the recovery passphrase locally — encrypted under the
     * device key, surfaced by Settings → Devices.
     */
    saveRecoveryPassphrase(words: string[]): Promise<void>
    /** Null when never stored or explicitly cleared. */
    loadRecoveryPassphrase(): Promise<string[] | null>
    clearRecoveryPassphrase(): Promise<void>
    /** Replaces any previous attestation — used for renewal and rotation. */
    saveDeviceAttestation(att: DeviceAttestation): Promise<void>
    loadDeviceAttestation(): Promise<DeviceAttestation | null>
    getBoundActorUri(): Promise<ActorUri | null>
    setBoundActorUri(actorUri: ActorUri): Promise<void>
    /** Drop all E2EE state. */
    clear(): Promise<void>
}

export class IndexedDbStorageAdapter implements E2eeStorage {
    private db: IDBPDatabase | null = null

    private async openIfNeeded(): Promise<IDBPDatabase> {
        if (this.db) return this.db
        this.db = await openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
                if (!db.objectStoreNames.contains(IDENTITY_STORE)) db.createObjectStore(IDENTITY_STORE)
                if (!db.objectStoreNames.contains(GROUPS_STORE)) db.createObjectStore(GROUPS_STORE)
                if (!db.objectStoreNames.contains(MLS_SNAPSHOT_STORE)) {
                    db.createObjectStore(MLS_SNAPSHOT_STORE)
                }
                if (!db.objectStoreNames.contains(RECOVERY_PASSPHRASE_STORE)) {
                    db.createObjectStore(RECOVERY_PASSPHRASE_STORE)
                }
                if (!db.objectStoreNames.contains(DEVICE_ATTESTATION_STORE)) {
                    db.createObjectStore(DEVICE_ATTESTATION_STORE)
                }
            },
        })
        return this.db
    }

    private async getMeta(): Promise<MetaRow | undefined> {
        const db = await this.openIfNeeded()
        return db.get(META_STORE, META_KEY) as Promise<MetaRow | undefined>
    }

    private async getOrCreateMeta(): Promise<MetaRow> {
        const existing = await this.getMeta()
        if (existing) return existing
        const meta: MetaRow = {
            device_id: crypto.randomUUID(),
            // The CryptoKey is non-extractable: an attacker with full
            // execution access in this context can call our adapter to
            // decrypt rows, but cannot lift the raw bytes out and use
            // them on a different machine.
            device_key: await crypto.subtle.generateKey(
                AES_ALGORITHM,
                /* extractable */ false,
                AES_KEY_USAGES,
            ),
        }
        const db = await this.openIfNeeded()
        await db.put(META_STORE, meta, META_KEY)
        return meta
    }

    async getOrCreateDeviceId(): Promise<DeviceId> {
        return (await this.getOrCreateMeta()).device_id
    }

    async getOrCreateDeviceKey(): Promise<CryptoKey> {
        return (await this.getOrCreateMeta()).device_key
    }

    async saveIdentityKeypair(keypair: IdentityKeypair): Promise<void> {
        const meta = await this.getOrCreateMeta()
        const sealed = await sealWith(meta.device_key, keypairToJson(keypair))
        const db = await this.openIfNeeded()
        await db.put(IDENTITY_STORE, sealed, IDENTITY_KEY)
    }

    async loadIdentityKeypair(): Promise<IdentityKeypair | null> {
        const meta = await this.getMeta()
        if (!meta) return null
        const db = await this.openIfNeeded()
        const sealed = (await db.get(IDENTITY_STORE, IDENTITY_KEY)) as SealedRow | undefined
        if (!sealed) return null
        const json = await openSealed<IdentityKeypairJson>(meta.device_key, sealed)
        return keypairFromJson(json)
    }

    async saveMlsSnapshot(snapshot: MlsSnapshot): Promise<void> {
        const meta = await this.getOrCreateMeta()
        const sealed = await sealWith(meta.device_key, mlsSnapshotToJson(snapshot))
        const db = await this.openIfNeeded()
        await db.put(MLS_SNAPSHOT_STORE, sealed, MLS_SNAPSHOT_KEY)
    }

    async loadMlsSnapshot(): Promise<MlsSnapshot | null> {
        const meta = await this.getMeta()
        if (!meta) return null
        const db = await this.openIfNeeded()
        const sealed = (await db.get(MLS_SNAPSHOT_STORE, MLS_SNAPSHOT_KEY)) as
            | SealedRow
            | undefined
        if (!sealed) return null
        try {
            const json = await openSealed<MlsSnapshotJson>(meta.device_key, sealed)
            return mlsSnapshotFromJson(json)
        } catch (e) {
            // Corrupt or wrong key (e.g. user wiped meta but not the
            // snapshot). Drop it so the next save is clean and a
            // fresh provider boots from scratch.
            // eslint-disable-next-line no-console
            console.warn("MLS snapshot decrypt failed; dropping", e)
            await db.delete(MLS_SNAPSHOT_STORE, MLS_SNAPSHOT_KEY).catch(() => undefined)
            return null
        }
    }

    async saveRecoveryPassphrase(words: string[]): Promise<void> {
        const meta = await this.getOrCreateMeta()
        const sealed = await sealWith(meta.device_key, { words })
        const db = await this.openIfNeeded()
        await db.put(RECOVERY_PASSPHRASE_STORE, sealed, RECOVERY_PASSPHRASE_KEY)
    }

    async loadRecoveryPassphrase(): Promise<string[] | null> {
        const meta = await this.getMeta()
        if (!meta) return null
        const db = await this.openIfNeeded()
        const sealed = (await db.get(
            RECOVERY_PASSPHRASE_STORE,
            RECOVERY_PASSPHRASE_KEY,
        )) as SealedRow | undefined
        if (!sealed) return null
        try {
            const json = await openSealed<{ words: string[] }>(meta.device_key, sealed)
            return Array.isArray(json.words) ? json.words : null
        } catch (e) {
            // Corrupt or wrong key. Drop it and behave as "not stored"
            // — the wrapped MSK is still on the server, the user just
            // can't view the passphrase from this device.
            // eslint-disable-next-line no-console
            console.warn("Recovery passphrase decrypt failed; dropping", e)
            await db
                .delete(RECOVERY_PASSPHRASE_STORE, RECOVERY_PASSPHRASE_KEY)
                .catch(() => undefined)
            return null
        }
    }

    async clearRecoveryPassphrase(): Promise<void> {
        const db = await this.openIfNeeded()
        await db.delete(RECOVERY_PASSPHRASE_STORE, RECOVERY_PASSPHRASE_KEY)
    }

    async saveDeviceAttestation(att: DeviceAttestation): Promise<void> {
        const meta = await this.getOrCreateMeta()
        const sealed = await sealWith(meta.device_key, deviceAttestationToJson(att))
        const db = await this.openIfNeeded()
        await db.put(DEVICE_ATTESTATION_STORE, sealed, DEVICE_ATTESTATION_KEY)
    }

    async loadDeviceAttestation(): Promise<DeviceAttestation | null> {
        const meta = await this.getMeta()
        if (!meta) return null
        const db = await this.openIfNeeded()
        const sealed = (await db.get(DEVICE_ATTESTATION_STORE, DEVICE_ATTESTATION_KEY)) as
            | SealedRow
            | undefined
        if (!sealed) return null
        try {
            const json = await openSealed<DeviceAttestationJson>(meta.device_key, sealed)
            return deviceAttestationFromJson(json)
        } catch (e) {
            // Corrupt or wrong key — drop the row; next register-device call
            // will mint a fresh attestation.
            // eslint-disable-next-line no-console
            console.warn("Device attestation decrypt failed; dropping", e)
            await db.delete(DEVICE_ATTESTATION_STORE, DEVICE_ATTESTATION_KEY).catch(() => undefined)
            return null
        }
    }

    async getBoundActorUri(): Promise<ActorUri | null> {
        const meta = await this.getMeta()
        return meta?.bound_actor_uri ?? null
    }

    async setBoundActorUri(actorUri: ActorUri): Promise<void> {
        const meta = await this.getOrCreateMeta()
        const updated: MetaRow = { ...meta, bound_actor_uri: actorUri }
        const db = await this.openIfNeeded()
        await db.put(META_STORE, updated, META_KEY)
    }

    async clear(): Promise<void> {
        const db = await this.openIfNeeded()
        const tx = db.transaction(
            [
                META_STORE,
                IDENTITY_STORE,
                GROUPS_STORE,
                MLS_SNAPSHOT_STORE,
                RECOVERY_PASSPHRASE_STORE,
                DEVICE_ATTESTATION_STORE,
            ],
            "readwrite",
        )
        await Promise.all([
            tx.objectStore(META_STORE).clear(),
            tx.objectStore(IDENTITY_STORE).clear(),
            tx.objectStore(GROUPS_STORE).clear(),
            tx.objectStore(MLS_SNAPSHOT_STORE).clear(),
            tx.objectStore(RECOVERY_PASSPHRASE_STORE).clear(),
            tx.objectStore(DEVICE_ATTESTATION_STORE).clear(),
        ])
        await tx.done
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

interface DeviceAttestationJson {
    drk_public: number[]
    drk_private: number[]
    signature: number[]
    kid: string
    issued_at: string
    expires_at: string
    signed_message: number[]
}

function deviceAttestationToJson(att: DeviceAttestation): DeviceAttestationJson {
    return {
        drk_public: Array.from(att.drk_public),
        drk_private: Array.from(att.drk_private),
        signature: Array.from(att.signature),
        kid: att.kid,
        issued_at: att.issued_at,
        expires_at: att.expires_at,
        signed_message: Array.from(att.signed_message),
    }
}

function deviceAttestationFromJson(j: DeviceAttestationJson): DeviceAttestation {
    return {
        drk_public: new Uint8Array(j.drk_public),
        drk_private: new Uint8Array(j.drk_private),
        signature: new Uint8Array(j.signature),
        kid: j.kid,
        issued_at: j.issued_at,
        expires_at: j.expires_at,
        signed_message: new Uint8Array(j.signed_message),
    }
}

async function sealWith(key: CryptoKey, value: object): Promise<SealedRow> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const plaintext = new TextEncoder().encode(JSON.stringify(value))
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        // Cast: subtle.encrypt accepts any BufferSource; TS's lib.dom
        // narrows to `BufferSource` which is what Uint8Array satisfies.
        plaintext as BufferSource,
    )
    return { ciphertext, iv }
}

async function openSealed<T>(key: CryptoKey, sealed: SealedRow): Promise<T> {
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: sealed.iv as BufferSource },
        key,
        sealed.ciphertext,
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

/**
 * `Uint8Array` doesn't survive `JSON.stringify` on its own — convert
 * to plain `number[]` for storage. Could base64 to save bytes, but the
 * blob is < 1 KB and AES-GCM compresses badly anyway, so don't bother.
 */
function keypairToJson(k: IdentityKeypair): IdentityKeypairJson {
    return {
        msk_public: Array.from(k.msk_public),
        msk_private: Array.from(k.msk_private),
        ssk_public: Array.from(k.ssk_public),
        ssk_private: Array.from(k.ssk_private),
        ssk_signature: Array.from(k.ssk_signature),
        usk_public: Array.from(k.usk_public),
        usk_private: Array.from(k.usk_private),
        usk_signature: Array.from(k.usk_signature),
    }
}

function keypairFromJson(j: IdentityKeypairJson): IdentityKeypair {
    return {
        msk_public: Uint8Array.from(j.msk_public),
        msk_private: Uint8Array.from(j.msk_private),
        ssk_public: Uint8Array.from(j.ssk_public),
        ssk_private: Uint8Array.from(j.ssk_private),
        ssk_signature: Uint8Array.from(j.ssk_signature),
        usk_public: Uint8Array.from(j.usk_public),
        usk_private: Uint8Array.from(j.usk_private),
        usk_signature: Uint8Array.from(j.usk_signature),
    }
}

interface MlsSnapshotJson {
    provider_state: number[]
    known_group_ids: ConversationId[]
}

function mlsSnapshotToJson(s: MlsSnapshot): MlsSnapshotJson {
    return {
        provider_state: Array.from(s.provider_state),
        known_group_ids: [...s.known_group_ids],
    }
}

function mlsSnapshotFromJson(j: MlsSnapshotJson): MlsSnapshot {
    return {
        provider_state: Uint8Array.from(j.provider_state ?? []),
        known_group_ids: j.known_group_ids ?? [],
    }
}
