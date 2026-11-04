import type { ActorUri, DeviceId, IdentityKeypair, ConversationId } from "@pinai/domain/models/e2ee"
import {
    isGeneration,
    parseHistoryKeyStanding,
    type HistoryKey,
    type HistoryKeyStanding,
} from "@pinai/domain/models/history-key"
import type { IDeviceKeyPort, SealedBytes } from "@pinai/domain/ports/device-key.port"
import type { IKeyValueStore } from "@pinai/domain/ports/key-value-store.port"

/**
 * The device's encrypted store, independent of where the bytes actually land.
 *
 * Everything here is schema and sealing: which collections exist, how each
 * row maps to JSON, and the seal/open round trip. The two things that are
 * genuinely platform-specific are injected — {@link IKeyValueStore} for
 * durable bytes and {@link IDeviceKeyPort} for at-rest encryption — so a
 * React Native build reuses this file whole and supplies SQLite or MMKV plus
 * a Keychain-backed key.
 *
 * Rows are sealed before they are stored, so the key-value backend only ever
 * sees ciphertext. The device id and the bound actor URI are the exceptions:
 * both are stored in the clear, because reading them must not require the
 * key (the id identifies the device to the server before anything is sealed,
 * and the bound URI is what tells us the key belongs to somebody else).
 */

const META = "meta"
const IDENTITY = "identity"
const MLS_SNAPSHOT = "mls_snapshot"
const RECOVERY_PASSPHRASE = "recovery_passphrase"
const DEVICE_ATTESTATION = "device_attestation"

/** One row per collection — this store keeps a single current value each. */
const CURRENT = "current"
/** Beside the kept words: the words minted but not yet taken by the IdP, the last standing, the newest generation seen. */
const PENDING = "pending"
const STANDING = "standing"
const NEWEST_GENERATION = "newest_generation"
const WORD_COUNT = 24
const DEVICE_ID_KEY = "device_id"
const BOUND_ACTOR_URI_KEY = "bound_actor_uri"

const NONCE_BYTES = 12

/**
 * Sealed rows go to the backend as one opaque blob: `nonce || ciphertext`.
 * Framing them rather than storing a `{ ciphertext, nonce }` object is what
 * lets the key-value port promise nothing but bytes, which is the only thing
 * every plausible backend can hold.
 */
function frame(sealed: SealedBytes): Uint8Array {
    const out = new Uint8Array(sealed.nonce.length + sealed.ciphertext.length)
    out.set(sealed.nonce, 0)
    out.set(sealed.ciphertext, sealed.nonce.length)
    return out
}

function unframe(bytes: Uint8Array): SealedBytes {
    return { nonce: bytes.subarray(0, NONCE_BYTES), ciphertext: bytes.subarray(NONCE_BYTES) }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

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
 * Per-device Device Root Key + IdP attestation, and the device's HPKE key registered with them.
 * `signed_message` is the canonical bytes the IdP signed, kept so the client can locally
 * re-verify after restore.
 */
export interface DeviceAttestation {
    drk_public: Uint8Array
    drk_private: Uint8Array
    signature: Uint8Array
    kid: string
    issued_at: string  // RFC3339
    expires_at: string // RFC3339, whole seconds: the text the IdP signed
    /** Canonical bytes the IdP signed — kept for local re-verification. */
    signed_message: Uint8Array
    /** Null in a row saved before the device had one: it makes one and registers again. */
    hpke: { public_key: Uint8Array; private_key: Uint8Array } | null
}

/** The history passphrase this device keeps (`identity-provider/specs/e2ee.md § 3.6`). */
export interface KeptPassphrase {
    words: string[]
    /** The generation they give — that one only. */
    generation: number
    /** The root key the device approved itself over with them, and reported; `null` before. */
    approvedRootKey: Uint8Array | null
    /** The HAK they give under the generation's salt. */
    derived: { salt: Uint8Array; hak: Uint8Array }
}

/** Words minted for a generation whose `PUT` is unanswered: never shown, reported, or used to seal. */
export interface PendingPassphrase {
    words: string[]
    key: HistoryKey
    hak: Uint8Array
}

export interface E2eeStorage {
    /** Returns the device's UUID, generating + persisting on first call. */
    getOrCreateDeviceId(): Promise<DeviceId>
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
     * The history key's rows. A read that can't load the device key throws; a row that won't open
     * or parse is set aside, never deleted, and reads as none.
     */
    saveKeptPassphrase(kept: KeptPassphrase): Promise<void>
    loadKeptPassphrase(): Promise<KeptPassphrase | null>
    savePendingPassphrase(pending: PendingPassphrase): Promise<void>
    loadPendingPassphrase(): Promise<PendingPassphrase | null>
    clearPendingPassphrase(): Promise<void>
    saveHistoryKeyStanding(standing: HistoryKeyStanding): Promise<void>
    loadHistoryKeyStanding(): Promise<HistoryKeyStanding | null>
    saveNewestHistoryGeneration(generation: number): Promise<void>
    loadNewestHistoryGeneration(): Promise<number | null>
    /** Replaces any previous attestation — used for renewal and rotation. */
    saveDeviceAttestation(att: DeviceAttestation): Promise<void>
    loadDeviceAttestation(): Promise<DeviceAttestation | null>
    getBoundActorUri(): Promise<ActorUri | null>
    setBoundActorUri(actorUri: ActorUri): Promise<void>
    /** Drop all E2EE state. */
    clear(): Promise<void>
}


export class SealedStorage implements E2eeStorage {
    private readonly kv: IKeyValueStore
    private readonly deviceKey: IDeviceKeyPort

    constructor(kv: IKeyValueStore, deviceKey: IDeviceKeyPort) {
        this.kv = kv
        this.deviceKey = deviceKey
    }

    private async seal(collection: string, value: object, key = CURRENT): Promise<void> {
        const sealed = await this.deviceKey.seal(encoder.encode(JSON.stringify(value)))
        await this.kv.put(collection, key, frame(sealed))
    }

    /**
     * Open the row, or drop it and answer `null`.
     *
     * Every caller wants the same failure behaviour: a row we cannot decrypt
     * is a row sealed under a key this device no longer has, and keeping it
     * only guarantees the same failure next time. Dropping it lets the next
     * save start clean — the identity re-registers, the MLS provider boots
     * fresh, the attestation is re-minted.
     */
    private async openOrDrop<T>(collection: string, what: string, key = CURRENT): Promise<T | null> {
        const bytes = await this.kv.get(collection, key)
        if (!bytes) return null
        try {
            return JSON.parse(decoder.decode(await this.deviceKey.open(unframe(bytes)))) as T
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`${what} decrypt failed; dropping`, e)
            await this.kv.delete(collection, key).catch(() => undefined)
            return null
        }
    }

    // Shared while in flight: first callers racing would each mint an id, and only the last
    // written would stay — the others bound to an id the device no longer has.
    private deviceId: Promise<DeviceId> | null = null

    getOrCreateDeviceId(): Promise<DeviceId> {
        this.deviceId ??= this.loadOrMintDeviceId().catch((e: unknown) => {
            this.deviceId = null
            throw e
        })
        return this.deviceId
    }

    private async loadOrMintDeviceId(): Promise<DeviceId> {
        const existing = await this.kv.get(META, DEVICE_ID_KEY)
        if (existing) return decoder.decode(existing) as DeviceId
        const id = crypto.randomUUID()
        await this.kv.put(META, DEVICE_ID_KEY, encoder.encode(id))
        return id as DeviceId
    }

    async saveIdentityKeypair(keypair: IdentityKeypair): Promise<void> {
        await this.seal(IDENTITY, keypairToJson(keypair))
    }

    async loadIdentityKeypair(): Promise<IdentityKeypair | null> {
        const json = await this.openOrDrop<IdentityKeypairJson>(IDENTITY, "Identity keypair")
        return json ? keypairFromJson(json) : null
    }

    async saveMlsSnapshot(snapshot: MlsSnapshot): Promise<void> {
        await this.seal(MLS_SNAPSHOT, mlsSnapshotToJson(snapshot))
    }

    async loadMlsSnapshot(): Promise<MlsSnapshot | null> {
        const json = await this.openOrDrop<MlsSnapshotJson>(MLS_SNAPSHOT, "MLS snapshot")
        return json ? mlsSnapshotFromJson(json) : null
    }

    async saveKeptPassphrase(kept: KeptPassphrase): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, keptToJson(kept))
    }

    async loadKeptPassphrase(): Promise<KeptPassphrase | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, CURRENT, keptFromJson)
    }

    async savePendingPassphrase(pending: PendingPassphrase): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, pendingToJson(pending), PENDING)
    }

    async loadPendingPassphrase(): Promise<PendingPassphrase | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, PENDING, pendingFromJson)
    }

    async clearPendingPassphrase(): Promise<void> {
        await this.kv.delete(RECOVERY_PASSPHRASE, PENDING)
    }

    async saveHistoryKeyStanding(standing: HistoryKeyStanding): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, standing, STANDING)
    }

    async loadHistoryKeyStanding(): Promise<HistoryKeyStanding | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, STANDING, parseHistoryKeyStanding)
    }

    async saveNewestHistoryGeneration(generation: number): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, { generation }, NEWEST_GENERATION)
    }

    async loadNewestHistoryGeneration(): Promise<number | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, NEWEST_GENERATION, (value) => {
            const generation = isRow(value) ? value.generation : undefined
            return isGeneration(generation) ? generation : null
        })
    }

    // The words can't be had again: a row that won't open or parse is moved aside, as the message cache does.
    private async openOrSetAside<T>(collection: string, key: string, parse: (value: unknown) => T | null): Promise<T | null> {
        await this.deviceKey.ready()
        const bytes = await this.kv.get(collection, key)
        if (!bytes) return null
        let value: unknown = undefined
        try {
            value = JSON.parse(decoder.decode(await this.deviceKey.open(unframe(bytes))))
        } catch {
            // Unreadable: set aside below.
        }
        const parsed = value === undefined ? null : parse(value)
        if (parsed !== null) return parsed
        // eslint-disable-next-line no-console
        console.warn(`${collection}/${key} can't be read; set aside`)
        await this.kv.put(collection, `${key}:unreadable:${new Date().toISOString()}`, bytes)
        await this.kv.delete(collection, key)
        return null
    }

    async saveDeviceAttestation(att: DeviceAttestation): Promise<void> {
        await this.seal(DEVICE_ATTESTATION, deviceAttestationToJson(att))
    }

    async loadDeviceAttestation(): Promise<DeviceAttestation | null> {
        const json = await this.openOrDrop<DeviceAttestationJson>(
            DEVICE_ATTESTATION,
            "Device attestation",
        )
        return json ? deviceAttestationFromJson(json) : null
    }

    async getBoundActorUri(): Promise<ActorUri | null> {
        const bytes = await this.kv.get(META, BOUND_ACTOR_URI_KEY)
        return bytes ? (decoder.decode(bytes) as ActorUri) : null
    }

    async setBoundActorUri(actorUri: ActorUri): Promise<void> {
        await this.kv.put(META, BOUND_ACTOR_URI_KEY, encoder.encode(actorUri))
    }

    /**
     * Wipes the rows *and* the key. Dropping the key is what makes this
     * irreversible: anything that survived in a backup is sealed under a key
     * that no longer exists.
     */
    async clear(): Promise<void> {
        this.deviceId = null
        await this.kv.clear()
        await this.deviceKey.wipe()
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function keptToJson(kept: KeptPassphrase): object {
    return {
        words: [...kept.words],
        generation: kept.generation,
        approved_root_key: kept.approvedRootKey ? Array.from(kept.approvedRootKey) : null,
        salt: Array.from(kept.derived.salt),
        hak: Array.from(kept.derived.hak),
    }
}

function keptFromJson(value: unknown): KeptPassphrase | null {
    if (!isRow(value)) return null
    const words = wordsOf(value.words)
    const salt = bytesOf(value.salt, 16)
    const hak = bytesOf(value.hak, 32)
    const approvedRootKey = value.approved_root_key === null ? null : bytesOf(value.approved_root_key, 32)
    if (!words || !isGeneration(value.generation) || !salt || !hak || approvedRootKey === undefined) return null
    return { words, generation: value.generation, approvedRootKey, derived: { salt, hak } }
}

function pendingToJson(pending: PendingPassphrase): object {
    return {
        words: [...pending.words],
        generation: pending.key.generation,
        salt: Array.from(pending.key.salt),
        check_value: Array.from(pending.key.checkValue),
        approval_public_key: Array.from(pending.key.approvalPublicKey),
        hak: Array.from(pending.hak),
    }
}

function pendingFromJson(value: unknown): PendingPassphrase | null {
    if (!isRow(value)) return null
    const words = wordsOf(value.words)
    const salt = bytesOf(value.salt, 16)
    const checkValue = bytesOf(value.check_value, 32)
    const approvalPublicKey = bytesOf(value.approval_public_key, 32)
    const hak = bytesOf(value.hak, 32)
    if (!words || !isGeneration(value.generation) || !salt || !checkValue || !approvalPublicKey || !hak) return null
    return { words, key: { generation: value.generation, salt, checkValue, approvalPublicKey }, hak }
}

function isRow(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function wordsOf(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.length === WORD_COUNT && value.every((w) => typeof w === "string" && w !== "")
        ? (value as string[])
        : undefined
}

function bytesOf(value: unknown, length: number): Uint8Array | undefined {
    return Array.isArray(value) &&
        value.length === length &&
        value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
        ? Uint8Array.from(value as number[])
        : undefined
}

interface DeviceAttestationJson {
    drk_public: number[]
    drk_private: number[]
    signature: number[]
    kid: string
    issued_at: string
    expires_at: string
    signed_message: number[]
    hpke_public?: number[]
    hpke_private?: number[]
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
        ...(att.hpke
            ? { hpke_public: Array.from(att.hpke.public_key), hpke_private: Array.from(att.hpke.private_key) }
            : {}),
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
        hpke:
            j.hpke_public && j.hpke_private
                ? { public_key: new Uint8Array(j.hpke_public), private_key: new Uint8Array(j.hpke_private) }
                : null,
    }
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
