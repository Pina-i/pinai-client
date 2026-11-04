import { vi } from "vitest"
import { ed25519, x25519 } from "@noble/curves/ed25519.js"
import { sha256 } from "@noble/hashes/sha2.js"

import { verifyStrict } from "@pinai/crypto/attestation-chain.adapter"
import { approvalBytes } from "@pinai/crypto/canonical-bytes"
import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import { HistoryArchiveAdapter } from "@pinai/crypto/history-archive.adapter"
import { NobleIdentityAdapter } from "@pinai/crypto/identity.adapter"
import type { DeviceAttestation, E2eeStorage, KeptPassphrase, MlsSnapshot, PendingPassphrase, RestoreDue } from "@pinai/crypto/sealed-storage"
import { MlsAdapter } from "@pinai/mls/wasm.adapter"
import type { Admission } from "@pinai/domain/models/admission"
import { emptyDeviceTrust, withTrust, type DeviceTrust, type DeviceTrustRow } from "@pinai/domain/models/device-trust"
import type { ActorUri, DeviceId, IdentityKeypair, KeyPackageStatusResponse } from "@pinai/domain/models/e2ee"
import {
    sameHistoryKey,
    type CurrentHistoryKey,
    type HistoryKey,
    type HistoryKeyStanding,
} from "@pinai/domain/models/history-key"
import { asActorUri } from "@pinai/domain/models/identity"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"
import type { ArchiveEntry, ArchivePage, IHistoryArchivePort } from "@pinai/domain/ports/history-archive.port"
import type { IHpkePort } from "@pinai/domain/ports/hpke.port"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"
import type { IKeyDirectoryPort, RegisterDeviceResponse } from "@pinai/domain/ports/key-directory.port"
import type { IMlsEngine } from "@pinai/domain/ports/mls-engine.port"
import type { ISessionPort } from "@pinai/domain/ports/session.port"

import { FakeIssuers } from "./issuers"
import { loadWasmModule } from "./wasm"

export const IDP = "https://idp.test"
export const ACTOR: ActorUri = asActorUri("https://idp.test/users/alice_xk9mp")

/** Argon2id stands aside — its cost is all it adds here; every other derivation is the real one. */
export class FastSealer extends HistoryArchiveAdapter {
    derivations = 0

    override async deriveKey(words: string[], salt: Uint8Array): Promise<Uint8Array> {
        this.derivations += 1
        const text = new TextEncoder().encode(words.join(" "))
        const input = new Uint8Array(text.length + salt.length)
        input.set(text)
        input.set(salt, text.length)
        return sha256(input)
    }
}

const stale = () => new IdpError(409, "stale_history_key", "Not the account's current history key")

/**
 * The history key's routes as the IdP answers them (`identity-provider/specs/e2ee.md § 5`): the
 * compare-and-set of a generation, uploads checked by generation, approvals by the passphrase
 * verified under the generation's approval key, reports — the last three from a session that
 * named its device. `log` keeps the order of what reached it, and of what the devices sealed.
 */
export class FakeHistoryIdp implements IHistoryArchivePort {
    key: CurrentHistoryKey | null = null
    readonly log: string[] = []
    readonly keyPackages = new FakeKeyPackages(this.log)
    readonly archive = new Map<string, ArchiveEntry & { created_at: string }>()
    readonly uploads: Array<{ generation: number; ids: string[] }> = []
    readonly approvals: Array<{ deviceId: string; generation: number }> = []
    readonly reports = new Map<string, number>()
    readonly rootKeys = new Map<string, Uint8Array>()
    /** The device each session — each token — named. */
    readonly named = new Map<string, string>()
    /** Runs as an approval arrives, before it is checked. */
    onApprove: (() => void) | null = null

    async getKey(): Promise<CurrentHistoryKey | null> {
        this.log.push("read key")
        return this.key ? { ...this.key } : null
    }

    async setKey(_idpUrl: string, accessToken: string, key: HistoryKey): Promise<void> {
        const device = this.namedDevice(accessToken)
        if (this.key && sameHistoryKey(this.key, key)) return
        if (key.generation !== (this.key?.generation ?? 0) + 1) {
            throw new IdpError(409, "history_key_conflict", "The history key is at another generation")
        }
        this.key = { ...key, setByDevice: device }
        this.archive.clear()
        this.log.push(`set key ${key.generation}`)
    }

    async uploadBatch(_idpUrl: string, _token: string, generation: number, entries: ArchiveEntry[]): Promise<number> {
        this.uploads.push({ generation, ids: entries.map((e) => e.id) })
        if (!this.key || generation !== this.key.generation) throw stale()
        let inserted = 0
        for (const entry of entries) {
            if (this.archive.has(entry.id)) continue
            const createdAt = new Date(Date.UTC(2026, 10, 1, 0, 0, this.archive.size)).toISOString()
            this.archive.set(entry.id, { ...entry, created_at: createdAt })
            inserted += 1
        }
        return inserted
    }

    async downloadPage(): Promise<ArchivePage> {
        this.log.push("read archive")
        return { entries: [...this.archive.values()], next_cursor: null }
    }

    async wipeArchive(): Promise<number> {
        const deleted = this.archive.size
        this.archive.clear()
        return deleted
    }

    session(): ISessionPort {
        return {
            linkDevice: async (_idpUrl, accessToken, deviceId) => {
                this.named.set(accessToken, deviceId)
                this.log.push("name session")
            },
            signOutOtherDevices: async () => undefined,
        }
    }

    directory(): IDeviceDirectoryPort {
        return {
            listDevices: async () => ({ devices: [] }),
            markRevoked: async () => undefined,
            approveByPassphrase: async (_idpUrl, accessToken, deviceId, generation, signature) => {
                this.onApprove?.()
                this.ownDevice(accessToken, deviceId)
                if (!this.key || generation !== this.key.generation) throw stale()
                const rootKey = this.rootKeys.get(deviceId)
                if (!rootKey || !verifyStrict(signature, approvalBytes(ACTOR, deviceId, rootKey), this.key.approvalPublicKey)) {
                    throw new IdpError(400, "invalid_request", "signature does not verify over the device's root key")
                }
                this.approvals.push({ deviceId, generation })
                this.log.push(`approve by passphrase ${generation}`)
            },
            approveByDevice: async () => undefined,
            reportHistoryKey: async (_idpUrl, accessToken, deviceId, generation) => {
                this.ownDevice(accessToken, deviceId)
                if (!this.key || generation !== this.key.generation) throw stale()
                this.reports.set(deviceId, generation)
                this.log.push(`report ${generation}`)
            },
        }
    }

    private namedDevice(accessToken: string): string {
        const device = this.named.get(accessToken)
        if (!device) throw new IdpError(403, "device_required", "Name this session's device first")
        return device
    }

    private ownDevice(accessToken: string, deviceId: string): void {
        if (this.namedDevice(accessToken) !== deviceId) {
            throw new IdpError(403, "device_mismatch", "This session signed in another device")
        }
    }
}

/** What a device keeps that these flows read, copied in and out as a sealed row would be. */
export class MemoryHistoryStorage {
    readonly deviceId = crypto.randomUUID() as DeviceId
    rootKey = ed25519.keygen()
    hpkeKey = x25519.keygen()
    /** The IdP's attestation of the root key, for a device whose engine makes KeyPackages (`publishingDevice`). */
    attested: RegisterDeviceResponse | null = null
    boundActorUri: ActorUri | null = null
    identityKeypair: IdentityKeypair | null = null
    mlsSnapshot: MlsSnapshot | null = null
    kept: KeptPassphrase | null = null
    pending: PendingPassphrase | null = null
    standing: HistoryKeyStanding | null = null
    admission: Admission | null = null
    newest: number | null = null
    restoreDue: RestoreDue | null = null
    trust: DeviceTrust = emptyDeviceTrust()
    /** Trust rows the next read finds unreadable, as a sealed row that won't open. */
    unreadable: DeviceTrustRow[] = []
    /** Where each write of words is noted; a device's is its IdP's, one timeline for both. */
    log: string[] = []

    asStorage(): E2eeStorage {
        return {
            getOrCreateDeviceId: async () => this.deviceId,
            loadDeviceAttestation: async () =>
                ({
                    drk_public: this.rootKey.publicKey,
                    drk_private: this.rootKey.secretKey,
                    hpke: { public_key: this.hpkeKey.publicKey, private_key: this.hpkeKey.secretKey },
                    ...(this.attested && {
                        signature: this.attested.signature,
                        kid: this.attested.kid,
                        issued_at: this.attested.issued_at,
                        expires_at: this.attested.expires_at,
                        signed_message: this.attested.signed_message,
                    }),
                }) as DeviceAttestation,
            getBoundActorUri: async () => this.boundActorUri,
            setBoundActorUri: async (actorUri: ActorUri) => {
                this.boundActorUri = actorUri
            },
            loadIdentityKeypair: async () => this.identityKeypair,
            saveIdentityKeypair: async (keypair: IdentityKeypair) => {
                this.identityKeypair = keypair
            },
            loadMlsSnapshot: async () => this.mlsSnapshot,
            saveMlsSnapshot: async (snapshot: MlsSnapshot) => {
                this.mlsSnapshot = snapshot
            },
            saveKeptPassphrase: async (kept: KeptPassphrase) => {
                this.log.push(`save words ${kept.generation}${kept.approvedRootKey ? " approved" : ""}`)
                this.kept = structuredClone(kept)
            },
            loadKeptPassphrase: async () => structuredClone(this.kept),
            savePendingPassphrase: async (pending: PendingPassphrase) => {
                this.log.push(`seal pending ${pending.key.generation}`)
                this.pending = structuredClone(pending)
            },
            loadPendingPassphrase: async () => structuredClone(this.pending),
            clearPendingPassphrase: async () => {
                if (this.pending) this.log.push("erase pending")
                this.pending = null
            },
            saveHistoryKeyStanding: async (standing: HistoryKeyStanding) => {
                this.standing = structuredClone(standing)
            },
            loadHistoryKeyStanding: async () => structuredClone(this.standing),
            saveAdmission: async (admission: Admission) => {
                this.admission = structuredClone(admission)
            },
            loadAdmission: async () => structuredClone(this.admission),
            saveNewestHistoryGeneration: async (generation: number) => {
                this.newest = generation
            },
            loadNewestHistoryGeneration: async () => this.newest,
            saveRestoreDue: async (due: RestoreDue) => {
                this.restoreDue = { ...due }
            },
            loadRestoreDue: async () => this.restoreDue && { ...this.restoreDue },
            clearRestoreDue: async () => {
                this.restoreDue = null
            },
            loadDeviceTrust: async () => {
                const unreadable = this.unreadable
                this.unreadable = []
                for (const row of unreadable) this.trust = { ...this.trust, [row]: [] }
                return { trust: structuredClone(this.trust), unreadable }
            },
            addToDeviceTrust: async (change: Partial<DeviceTrust>) => {
                this.trust = structuredClone(withTrust(this.trust, change))
                return structuredClone(this.trust)
            },
        } as unknown as E2eeStorage
    }
}

/** For a device that reviews no device list: any check of an attestation fails loudly. */
const NO_JWKS: IJwksCachePort = {
    getKey: async () => {
        throw new Error("This test device was given no JWKS")
    },
    invalidate: () => undefined,
}

/**
 * A device on `idp`: the real E2EE adapter, its history key engine whole, with registration and
 * KeyPackages standing in (they log, nothing more). Each device signs in with its own token; a
 * device's next page load is `historyDevice(idp, name, device.storage)`. `jwks` attests the devices
 * it reviews.
 */
export function historyDevice(
    idp: FakeHistoryIdp,
    name: string,
    storage = new MemoryHistoryStorage(),
    jwks = NO_JWKS,
    engine: { mls: IMlsEngine } | null = null,
    hpke: IHpkePort = {} as never,
) {
    const sealer = new FastSealer()
    const e2ee = new E2eeAdapter(
        engine ? new NobleIdentityAdapter() : ({} as never),
        engine ? engine.mls : ({} as never),
        storage.asStorage(),
        engine ? (idp.keyPackages as unknown as IKeyDirectoryPort) : ({} as never),
        hpke,
        jwks,
        idp,
        sealer,
    )
    idp.rootKeys.set(storage.deviceId, storage.rootKey.publicKey)
    storage.log = idp.log
    vi.spyOn(e2ee, "registerDevice").mockImplementation(async () => {
        idp.rootKeys.set(storage.deviceId, storage.rootKey.publicKey)
        idp.log.push("register device")
    })
    if (!engine) {
        vi.spyOn(e2ee, "register").mockImplementation(async () => {
            idp.log.push("key packages")
            return { device_id: storage.deviceId, fingerprint: "" }
        })
    }
    const deps = {
        e2eePort: e2ee,
        sessionPort: idp.session(),
        historyArchivePort: idp,
        deviceDirectoryPort: idp.directory(),
    }
    return { name, e2ee, storage, sealer, token: `tok-${name}`, deps }
}

/**
 * `historyDevice` whose `register` and refills are the real ones: its engine makes KeyPackages
 * under the credential its attested root key binds, and the IdP keeps its stash
 * (`FakeHistoryIdp.keyPackages`). Registration itself still only logs.
 */
export async function publishingDevice(idp: FakeHistoryIdp, name: string, storage = new MemoryHistoryStorage(), jwks = NO_JWKS) {
    const mls = new MlsAdapter()
    await mls.initialize({ module_or_path: await loadWasmModule() } as never)
    storage.attested ??= new FakeIssuers().attest(ACTOR, storage.deviceId, storage.rootKey.publicKey)
    return historyDevice(idp, name, storage, jwks, { mls })
}

/** The KeyPackage routes as the IdP answers them (`identity-provider/specs/e2ee.md § 3.5`): a stash per device, at most `cap`. */
export class FakeKeyPackages {
    readonly available = new Map<string, number>()
    readonly cap: number
    readonly threshold: number
    private readonly log: string[]

    constructor(log: string[], cap = 12, threshold = 4) {
        this.log = log
        this.cap = cap
        this.threshold = threshold
    }

    /** Lists only the devices with a package left, as the IdP does. */
    async getKeyPackageStatus(): Promise<KeyPackageStatusResponse> {
        const devices = [...this.available]
            .filter(([, available]) => available > 0)
            .map(([device_id, available]) => ({ device_id, available, needs_refill: available <= this.threshold }))
        return { devices, refill_threshold: this.threshold, cap: this.cap }
    }

    async uploadKeyPackages(_idpUrl: string, _token: string, deviceId: string, packages: unknown[]) {
        const after = (this.available.get(deviceId) ?? 0) + packages.length
        if (after > this.cap) throw new IdpError(400, "invalid_request", "Past the stash's cap")
        this.available.set(deviceId, after)
        this.log.push(`upload ${packages.length}`)
        return { uploaded: packages.length, available_after: after }
    }

    /** Claims taken by peers: the stash shrinks. */
    take(deviceId: string, count: number): void {
        this.available.set(deviceId, Math.max(0, (this.available.get(deviceId) ?? 0) - count))
    }
}
