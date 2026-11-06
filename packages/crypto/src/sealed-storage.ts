import {
    DEVICE_TRUST_ROWS,
    emptyDeviceTrust,
    withTrust,
    type DeviceTrust,
    type DeviceTrustRow,
    type BaselineIntent,
    type DevicesBefore,
    type HandshakePartner,
    type KnownDevice,
} from "@pinai/domain/models/device-trust"
import type { ActorUri, DeviceId, IdentityKeypair, ConversationId } from "@pinai/domain/models/e2ee"
import { parseAdmission, type Admission } from "@pinai/domain/models/admission"
import {
    isGeneration,
    parseHistoryKeyStanding,
    type HistoryKey,
    type HistoryKeyStanding,
} from "@pinai/domain/models/history-key"
import { parseRearchiveDue, type RearchiveDue } from "@pinai/domain/models/history-rearchive"
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
/**
 * Beside the kept words: the words minted but not yet taken by the IdP, the last standing and
 * admission, the newest generation seen, the generation an archive restore is due under, and the
 * re-archive after a replacement of the words with how far it got.
 */
const PENDING = "pending"
const STANDING = "standing"
const ADMISSION = "admission"
const NEWEST_GENERATION = "newest_generation"
const RESTORE_DUE = "restore_due"
const REARCHIVE_DUE = "rearchive_due"
/** The generation whose words a start over set and the user hasn't been shown past yet. */
const NEW_WORDS = "new_words"
/**
 * `device_trust`, beside the attestation: a store of its own would take an IndexedDB upgrade. One
 * row a part, so an unreadable one loses no other, and a new part is a new row.
 */
const TRUST_ROWS: Record<DeviceTrustRow, string> = {
    seen: "trust:seen",
    approved: "trust:approved",
    revoked: "trust:revoked",
    partners: "trust:partners",
    baselines: "trust:baselines",
    before: "trust:before",
}
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
    /** When the row was written (ms since the epoch), `null` in a row from before it was recorded. */
    mintedAt: number | null
    /** Minted to replace words this device holds: its promotion marks the re-archive due. */
    rearchive?: true
    /** What its baseline keeps once the IdP took it: read by the settle after a lost answer. */
    intent?: BaselineIntent
}

/** The archive's restore due under `generation`, and when it was last applied (`null` before). */
export interface RestoreDue {
    generation: number
    appliedAt: string | null
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
    saveAdmission(admission: Admission): Promise<void>
    loadAdmission(): Promise<Admission | null>
    saveNewestHistoryGeneration(generation: number): Promise<void>
    loadNewestHistoryGeneration(): Promise<number | null>
    saveRestoreDue(due: RestoreDue): Promise<void>
    loadRestoreDue(): Promise<RestoreDue | null>
    clearRestoreDue(): Promise<void>
    saveRearchiveDue(due: RearchiveDue): Promise<void>
    loadRearchiveDue(): Promise<RearchiveDue | null>
    clearRearchiveDue(): Promise<void>
    saveNewWordsGeneration(generation: number): Promise<void>
    loadNewWordsGeneration(): Promise<number | null>
    clearNewWordsGeneration(): Promise<void>
    /**
     * What the device keeps of the account's devices (`identity-provider/specs/e2ee.md § 3.9`). Read
     * as the history key's rows are: a row that won't open or parse is set aside, reads as empty,
     * and is named in `unreadable`. Adding reads each row again just before writing it, so what
     * another tab added meanwhile stays.
     */
    loadDeviceTrust(): Promise<{ trust: DeviceTrust; unreadable: DeviceTrustRow[] }>
    addToDeviceTrust(change: Partial<DeviceTrust>): Promise<DeviceTrust>
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

    async saveAdmission(admission: Admission): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, admission, ADMISSION)
    }

    async loadAdmission(): Promise<Admission | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, ADMISSION, parseAdmission)
    }

    async saveNewestHistoryGeneration(generation: number): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, { generation }, NEWEST_GENERATION)
    }

    async loadNewestHistoryGeneration(): Promise<number | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, NEWEST_GENERATION, generationFromJson)
    }

    async saveRestoreDue(due: RestoreDue): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, { generation: due.generation, applied_at: due.appliedAt }, RESTORE_DUE)
    }

    async loadRestoreDue(): Promise<RestoreDue | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, RESTORE_DUE, (value) => {
            const generation = generationFromJson(value)
            const appliedAt = isRow(value) ? value.applied_at : undefined
            if (generation === null || (appliedAt !== null && typeof appliedAt !== "string")) return null
            return { generation, appliedAt }
        })
    }

    async clearRestoreDue(): Promise<void> {
        await this.kv.delete(RECOVERY_PASSPHRASE, RESTORE_DUE)
    }

    async saveRearchiveDue(due: RearchiveDue): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, due, REARCHIVE_DUE)
    }

    async loadRearchiveDue(): Promise<RearchiveDue | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, REARCHIVE_DUE, parseRearchiveDue)
    }

    async clearRearchiveDue(): Promise<void> {
        await this.kv.delete(RECOVERY_PASSPHRASE, REARCHIVE_DUE)
    }

    async saveNewWordsGeneration(generation: number): Promise<void> {
        await this.seal(RECOVERY_PASSPHRASE, { generation }, NEW_WORDS)
    }

    async loadNewWordsGeneration(): Promise<number | null> {
        return this.openOrSetAside(RECOVERY_PASSPHRASE, NEW_WORDS, generationFromJson)
    }

    async clearNewWordsGeneration(): Promise<void> {
        await this.kv.delete(RECOVERY_PASSPHRASE, NEW_WORDS)
    }

    async loadDeviceTrust(): Promise<{ trust: DeviceTrust; unreadable: DeviceTrustRow[] }> {
        const trust = emptyDeviceTrust()
        const unreadable: DeviceTrustRow[] = []
        for (const row of DEVICE_TRUST_ROWS) {
            const read = await this.readTrustRow(row)
            if (read.setAside) unreadable.push(row)
            if (read.value) Object.assign(trust, { [row]: read.value })
        }
        return { trust, unreadable }
    }

    async addToDeviceTrust(change: Partial<DeviceTrust>): Promise<DeviceTrust> {
        let trust = emptyDeviceTrust()
        for (const row of DEVICE_TRUST_ROWS) {
            const held = { ...emptyDeviceTrust(), [row]: (await this.readTrustRow(row)).value ?? [] }
            const added = withTrust(held, { [row]: change[row] ?? [] })
            if (added !== held) await this.seal(DEVICE_ATTESTATION, trustRowToJson(row, added), TRUST_ROWS[row])
            trust = { ...trust, [row]: added[row] }
        }
        return trust
    }

    private readTrustRow(row: DeviceTrustRow) {
        return this.readOrSetAside<DeviceTrust[DeviceTrustRow]>(DEVICE_ATTESTATION, TRUST_ROWS[row], TRUST_ROW_PARSERS[row])
    }

    private async openOrSetAside<T>(collection: string, key: string, parse: (value: unknown) => T | null): Promise<T | null> {
        return (await this.readOrSetAside(collection, key, parse)).value
    }

    // Neither the words nor what was seen of the devices can be had again: an unreadable row is moved aside, as the message cache does.
    private async readOrSetAside<T>(
        collection: string,
        key: string,
        parse: (value: unknown) => T | null,
    ): Promise<{ value: T | null; setAside: boolean }> {
        await this.deviceKey.ready()
        const bytes = await this.kv.get(collection, key)
        if (!bytes) return { value: null, setAside: false }
        let value: unknown = undefined
        try {
            value = JSON.parse(decoder.decode(await this.deviceKey.open(unframe(bytes))))
        } catch {
            // Unreadable: set aside below.
        }
        const parsed = value === undefined ? null : parse(value)
        if (parsed !== null) return { value: parsed, setAside: false }
        // eslint-disable-next-line no-console
        console.warn(`${collection}/${key} can't be read; set aside`)
        // Two set aside within a millisecond keep each their own.
        const suffix = crypto.randomUUID().slice(0, 8)
        await this.kv.put(collection, `${key}:unreadable:${new Date().toISOString()}:${suffix}`, bytes)
        await this.kv.delete(collection, key)
        return { value: null, setAside: true }
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

function generationFromJson(value: unknown): number | null {
    const generation = isRow(value) ? value.generation : undefined
    return isGeneration(generation) ? generation : null
}

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
        minted_at: pending.mintedAt,
        ...(pending.rearchive ? { rearchive: true } : {}),
        ...(pending.intent ? { intent: { cause: pending.intent.cause, refused: pending.intent.refused } } : {}),
    }
}

function intentFromJson(value: unknown): BaselineIntent | null {
    if (!isRow(value) || (value.cause !== "start-over" && value.cause !== "replacement")) return null
    if (value.refused !== null && typeof value.refused !== "string") return null
    return { cause: value.cause, refused: value.refused }
}

function pendingFromJson(value: unknown): PendingPassphrase | null {
    if (!isRow(value)) return null
    const words = wordsOf(value.words)
    const salt = bytesOf(value.salt, 16)
    const checkValue = bytesOf(value.check_value, 32)
    const approvalPublicKey = bytesOf(value.approval_public_key, 32)
    const hak = bytesOf(value.hak, 32)
    const mintedAt = value.minted_at ?? null
    if (!words || !isGeneration(value.generation) || !salt || !checkValue || !approvalPublicKey || !hak) return null
    if (mintedAt !== null && !Number.isFinite(mintedAt)) return null
    const intent = value.intent === undefined ? null : intentFromJson(value.intent)
    if (value.intent !== undefined && !intent) return null
    const key = { generation: value.generation, salt, checkValue, approvalPublicKey }
    return {
        words,
        key,
        hak,
        mintedAt: mintedAt as number | null,
        ...(value.rearchive === true ? { rearchive: true as const } : {}),
        ...(intent ? { intent } : {}),
    }
}

function knownDeviceToJson(device: KnownDevice): object {
    return { device_id: device.deviceId, root_key: Array.from(device.rootKey) }
}

function knownDevicesFromJson(value: unknown): KnownDevice[] | null {
    if (!isRow(value) || !Array.isArray(value.devices)) return null
    const devices: KnownDevice[] = []
    for (const row of value.devices as unknown[]) {
        const rootKey = isRow(row) ? bytesOf(row.root_key, 32) : undefined
        if (!isRow(row) || typeof row.device_id !== "string" || !rootKey) return null
        devices.push({ deviceId: row.device_id, rootKey })
    }
    return devices
}

function trustRowToJson(row: DeviceTrustRow, trust: DeviceTrust): object {
    switch (row) {
        case "revoked":
            return { device_ids: [...trust.revoked] }
        case "partners":
            return { partners: trust.partners.map((p) => ({ ...knownDeviceToJson(p), hpke_key: Array.from(p.hpkeKey) })) }
        case "baselines":
            return { generations: [...trust.baselines] }
        case "before":
            return {
                before: trust.before.map((b) => ({
                    generation: b.generation,
                    cause: b.cause,
                    devices: b.devices.map(knownDeviceToJson),
                    refused: b.refused.map(knownDeviceToJson),
                })),
            }
        case "seen":
        case "approved":
            return { devices: trust[row].map(knownDeviceToJson) }
    }
}

const TRUST_ROW_PARSERS: { [R in DeviceTrustRow]: (value: unknown) => DeviceTrust[R] | null } = {
    seen: knownDevicesFromJson,
    approved: knownDevicesFromJson,
    revoked: revokedFromJson,
    partners: partnersFromJson,
    baselines: baselinesFromJson,
    before: beforeFromJson,
}

function baselinesFromJson(value: unknown): number[] | null {
    if (!isRow(value) || !Array.isArray(value.generations)) return null
    const generations = value.generations as unknown[]
    return generations.every((g) => Number.isInteger(g) && (g as number) > 0) ? (generations as number[]) : null
}

function beforeFromJson(value: unknown): DevicesBefore[] | null {
    if (!isRow(value) || !Array.isArray(value.before)) return null
    const before: DevicesBefore[] = []
    for (const entry of value.before as unknown[]) {
        if (!isRow(entry) || !isGeneration(entry.generation)) return null
        const devices = knownDevicesFromJson(entry)
        const refused = knownDevicesFromJson({ devices: entry.refused })
        if (!devices || !refused || (entry.cause !== "start-over" && entry.cause !== "replacement")) return null
        before.push({ generation: entry.generation, cause: entry.cause, devices, refused })
    }
    return before
}

function partnersFromJson(value: unknown): HandshakePartner[] | null {
    if (!isRow(value) || !Array.isArray(value.partners)) return null
    const partners: HandshakePartner[] = []
    for (const row of value.partners as unknown[]) {
        const rootKey = isRow(row) ? bytesOf(row.root_key, 32) : undefined
        const hpkeKey = isRow(row) ? bytesOf(row.hpke_key, 32) : undefined
        if (!isRow(row) || typeof row.device_id !== "string" || !rootKey || !hpkeKey) return null
        partners.push({ deviceId: row.device_id, rootKey, hpkeKey })
    }
    return partners
}

function revokedFromJson(value: unknown): DeviceId[] | null {
    if (!isRow(value) || !Array.isArray(value.device_ids)) return null
    const ids = value.device_ids as unknown[]
    return ids.every((id) => typeof id === "string") ? (ids as DeviceId[]) : null
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
