/**
 * Top-level `IE2eePort` implementation. Wires the MLS engine, the encrypted
 * IndexedDB store, the IdP REST surface, the JWKS / attestation chain, and
 * the history-archive crypto + transport into the operations the rest of
 * the app calls.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { equalBytes } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import type { Admission, CheckedPartner } from "@pinai/domain/models/admission"
import { peerAgainstList, type HandshakeRole } from "@pinai/domain/models/approval-handshake"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import {
    actsOnApproval,
    duplicateDeviceIds,
    firstToCommitOut,
    judgeDevices,
    judgeLeaf,
    keyChangedUnder,
    resetByUnapproved,
    resetSince,
    sameDevice,
    trustEventKey,
    undecided,
    type DeviceTrust,
    type DeviceTrustVerdict,
    type HandshakeKeysRefusal,
    type HandshakePartner,
    type HistoryReset,
    type KnownDevice,
    type TrustEvent,
} from "@pinai/domain/models/device-trust"
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
    leafOrigin,
    sameCredential,
    untrustedLeaf,
    type LeafClaim,
    type LeafCredential,
    type LeafVerdict,
    type MlsLeaf,
    type UntrustedLeaf,
} from "@pinai/domain/models/leaf-trust"
import {
    ARCHIVE_BUFFER_LIMIT,
    ARCHIVE_UPLOAD_LIMIT,
    decodeArchiveEnvelope,
    editEntryId,
    encodeArchiveEnvelope,
    type ArchiveEnvelope,
    type ArchivedEntry,
} from "@pinai/domain/models/history-archive"
import {
    approvalCarriedOver,
    buffersForArchive,
    isSettled,
    newestGenerationSeen,
    passphraseVerdict,
    standingAgainst,
    type DerivedHistoryKey,
    type HistoryKey,
    type HistoryKeyStanding,
    type PendingHistoryKey,
} from "@pinai/domain/models/history-key"
import { IdpError, isStaleHistoryKey } from "@pinai/domain/models/idp-error"
import {
    shareCandidates,
    type KeyShare,
    type KeyShareRefusal,
    type OutgoingKeyShare,
    type ShareRecipientRefusal,
} from "@pinai/domain/models/key-share"
import type { ApprovalHandshakeSession, IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { IHistoryArchivePort } from "@pinai/domain/ports/history-archive.port"
import type { HpkeKeyPair, IHpkePort } from "@pinai/domain/ports/hpke.port"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"

import { ApprovalHandshake, newApprovalCode } from "./approval-handshake"
import {
    attestedUntil,
    checkListedDevices,
    verifyApproval,
    verifyDeviceChain,
    verifyDeviceRoot,
    verifyLeafCredential,
    verifyStrict,
    type RootChecks,
} from "./attestation-chain.adapter"
import {
    approvalBytes,
    archiveEntryAad,
    attestationBytes,
    deviceHpkeKeyBytes,
    leafBindingBytes,
} from "./canonical-bytes"
import { HISTORY_SALT_BYTES, type HistoryArchiveAdapter } from "./history-archive.adapter"
import type { IdentityAdapter } from "./identity.adapter"
import { openKeyShare, sealKeyShare } from "./key-share"
import type { IKeyDirectoryPort } from "@pinai/domain/ports/key-directory.port"
import type { IMlsEngine } from "@pinai/domain/ports/mls-engine.port"
import type { DeviceAttestation, E2eeStorage, KeptPassphrase, RestoreDue } from "./sealed-storage"

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

type HeldKey = { generation: number; hak: Uint8Array }
type Holding = { standing: HistoryKeyStanding; key: HeldKey | null }
const UNCHECKED: Holding = { standing: { kind: "unchecked" }, key: null }

export class E2eeAdapter implements IE2eePort {
    private readonly identity: IdentityAdapter
    private readonly mls: IMlsEngine
    private readonly storage: E2eeStorage
    private readonly directory: IKeyDirectoryPort
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
        hpke: IHpkePort,
        jwks: IJwksCachePort,
        historyArchive: IHistoryArchivePort | null = null,
        historyCrypto: HistoryArchiveAdapter | null = null,
    ) {
        this.identity = identity
        this.mls = mls
        this.storage = storage
        this.directory = directory
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

    /**
     * A claimed KeyPackage's leaf: `identity-provider/specs/e2ee.md § 3.4`, and the device it was
     * claimed for — over `rootKey` too, for a sibling found approved over it.
     */
    private async checkClaim(actorUri: ActorUri, claim: ClaimedKeyPackage, rootKey?: Uint8Array): Promise<LeafVerdict> {
        let leaf: LeafClaim
        try {
            leaf = await this.mls.inspectKeyPackage(claim.key_package)
        } catch {
            return { ok: false, reason: "malformed" }
        }
        return admitsClaim(await verifyLeafCredential(leaf, this.jwks), actorUri, claim.device_id, rootKey)
    }

    /** Verdicts by leaf fingerprint, each until its attestation's expiry; an issuer out of reach is never kept. */
    private readonly leafVerdicts = new Map<string, { verdict: LeafVerdict; until: number }>()
    private readonly rootChecks: RootChecks = new Map()

    private async verifyLeaf(leaf: MlsLeaf): Promise<LeafVerdict> {
        const fingerprint = leafFingerprint(leaf)
        const held = this.leafVerdicts.get(fingerprint)
        if (held && held.until > Date.now()) return held.verdict
        const verdict = await verifyLeafCredential(leaf, this.jwks)
        const expiresAt = leaf.credential?.idp_att.expires_at
        if (verdict.ok && expiresAt) this.leafVerdicts.set(fingerprint, { verdict, until: attestedUntil(expiresAt) })
        else if (!verdict.ok && verdict.reason !== "unreachable") this.leafVerdicts.set(fingerprint, { verdict, until: Infinity })
        return verdict
    }

    /** By conversation and leaf index; each holds while the group holds that leaf as recorded. */
    private readonly untrustedLeaves = new Map<string, { leaf: UntrustedLeaf; fingerprint: string }>()
    private readonly trustEvents = new Map<string, Exclude<TrustEvent, { kind: "untrusted-leaf" }>>()
    private readonly trustListeners = new Set<(event: TrustEvent) => void>()
    private readonly withdrawnListeners = new Set<(event: TrustEvent) => void>()

    onTrustEvent(listener: (event: TrustEvent) => void): () => void {
        this.trustListeners.add(listener)
        for (const event of this.trustSnapshot()) tell(listener, event)
        return () => this.trustListeners.delete(listener)
    }

    onTrustWithdrawn(listener: (event: TrustEvent) => void): () => void {
        this.withdrawnListeners.add(listener)
        return () => this.withdrawnListeners.delete(listener)
    }

    trustSnapshot(): TrustEvent[] {
        const leaves = [...this.untrustedLeaves.values()].map(({ leaf }): TrustEvent => ({ kind: "untrusted-leaf", leaf }))
        return [...this.trustEvents.values(), ...leaves]
    }

    // A second event about the same thing is the one standing: it isn't told again.
    private stand(event: Exclude<TrustEvent, { kind: "untrusted-leaf" }>): void {
        const key = trustEventKey(event)
        if (this.trustEvents.has(key)) return
        this.trustEvents.set(key, event)
        // eslint-disable-next-line no-console
        console.warn(`[e2ee] trust: ${event.kind}`, event)
        for (const listener of this.trustListeners) tell(listener, event)
    }

    private withdrawUnapproved(): void {
        this.withdraw((event) => event.kind === "unapproved-device")
    }

    private withdraw(stops: (event: Exclude<TrustEvent, { kind: "untrusted-leaf" }>) => boolean): void {
        for (const [key, event] of this.trustEvents) {
            if (!stops(event)) continue
            this.trustEvents.delete(key)
            for (const listener of this.withdrawnListeners) tell(listener, event)
        }
    }

    private recordUntrusted(conversationId: ConversationId, leaf: MlsLeaf, reason: UntrustedLeaf["reason"]): void {
        const key = `${conversationId}:${leaf.leafIndex}`
        const fingerprint = leafFingerprint(leaf)
        const held = this.untrustedLeaves.get(key)
        if (held?.fingerprint === fingerprint && held.leaf.reason === reason) return
        this.dropLeafRecord(key)
        const record = untrustedLeaf(conversationId, leaf, reason)
        this.untrustedLeaves.set(key, { leaf: record, fingerprint })
        // eslint-disable-next-line no-console
        console.warn(`[e2ee] a leaf in ${conversationId} isn't trusted (${reason})`, record)
        for (const listener of this.trustListeners) tell(listener, { kind: "untrusted-leaf", leaf: record })
    }

    private dropLeafRecord(key: string): void {
        const held = this.untrustedLeaves.get(key)
        if (!held) return
        this.untrustedLeaves.delete(key)
        for (const listener of this.withdrawnListeners) tell(listener, { kind: "untrusted-leaf", leaf: held.leaf })
    }

    /**
     * Every leaf met in a group — a Welcome's tree, a commit bringing one in or replacing one — is
     * checked; one failing is recorded and announced, never thrown: committing it out is a run of its
     * own (`removeUntrustedLeaves`), queued with the group's other changes.
     */
    private async checkLeavesMet(conversationId: ConversationId, met: readonly MlsLeaf[]): Promise<void> {
        await this.forgetLeavesGone(conversationId)
        for (const leaf of met) {
            if (leaf.own) continue
            const key = `${conversationId}:${leaf.leafIndex}`
            if (this.untrustedLeaves.get(key)?.fingerprint === leafFingerprint(leaf)) continue
            const verdict = await this.verifyLeaf(leaf)
            // An issuer out of reach says nothing of the leaf: it is checked again when next met.
            if (verdict.ok || verdict.reason === "unreachable") {
                this.dropLeafRecord(key)
                continue
            }
            this.recordUntrusted(conversationId, leaf, verdict.reason)
        }
    }

    /** Drops the records of a group's leaves that left it or changed. */
    private async forgetLeavesGone(conversationId: ConversationId): Promise<void> {
        const recorded = [...this.untrustedLeaves].filter(([, { leaf }]) => leaf.conversationId === conversationId)
        if (recorded.length === 0) return
        const held = (await this.mls.hasGroup(conversationId)) ? await this.mls.groupLeaves(conversationId) : []
        for (const [key, { leaf, fingerprint }] of recorded) {
            if (!held.some((h) => h.leafIndex === leaf.leafIndex && leafFingerprint(h) === fingerprint)) {
                this.dropLeafRecord(key)
            }
        }
    }

    // ─── The account's devices, as this device judges them ────────────

    /** The generation set past the one this device holds, as the last check of the key found it. */
    private reset: HistoryReset | null = null
    // One reader-writer of the trust rows at a time within the page; another tab's writes are read again before each put.
    private trustTurn: Promise<unknown> = Promise.resolve()
    /** Commit-outs the instance refused for good, by conversation and leaf fingerprint: not rebuilt this page load. */
    private readonly refusedCommitOuts = new Set<string>()

    async reviewDevices(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        devices: readonly DeviceListEntry[],
    ): Promise<DeviceTrustVerdict> {
        const thisDevice = await this.storage.getOrCreateDeviceId()
        // A review that decides nothing announces nobody (§ 3.9 "Who acts").
        const decidesNothing = (listed: KnownDevice[] = []) => {
            this.withdrawUnapproved()
            return undecided(thisDevice, listed)
        }
        const duplicates = duplicateDeviceIds(devices.map((d) => d.device_id))
        if (duplicates.length > 0) {
            this.stand({ kind: "device-list-refused", duplicates })
            return decidesNothing()
        }
        this.withdraw((event) => event.kind === "device-list-refused")
        const listed = devices.flatMap((d) => (d.drk_public_key ? [{ deviceId: d.device_id, rootKey: d.drk_public_key }] : []))
        const revoked = devices.filter((d) => d.revoked_at !== null).map((d) => d.device_id)
        const kept = await this.withTrustRows(() => ({ change: { revoked }, result: null }))
        if (!kept) return decidesNothing(listed)

        const pending = (await this.storage.loadPendingPassphrase())?.key.generation ?? null
        const decider = await this.decider(idpUrl, accessToken, pending)
        this.warnOfReset(listed, kept.trust, thisDevice, pending)
        if (!decider) return decidesNothing(listed)

        const checked = await checkListedDevices(actorUri, devices, decider.approvalKey, this.jwks, this.rootChecks)
        const ownRootKey = (await this.storage.loadDeviceAttestation())?.drk_public ?? null
        const judged = (
            await this.withTrustRows((trust) => {
                const result = judgeDevices({ devices: checked, generation: decider.generation, trust, thisDevice, ownRootKey })
                return { change: result.keep, result }
            })
        )?.result
        if (!judged) return decidesNothing(listed)
        this.withdraw((event) => event.kind === "unapproved-device" && !judged.unapproved.some((d) => sameDevice(d, event)))
        for (const device of judged.unapproved) this.stand({ kind: "unapproved-device", ...device })
        return {
            acting: true,
            generation: decider.generation,
            thisDevice,
            listed,
            approved: judged.approved,
            unsettled: judged.unsettled,
        }
    }

    /**
     * The generation and the approval key this device derived itself, when it acts on approval —
     * the key read again first, unless a pending key waits: settling it is the flow's, before any
     * check.
     */
    private async decider(
        idpUrl: string,
        accessToken: string,
        pending: number | null,
    ): Promise<{ generation: number; approvalKey: Uint8Array } | null> {
        if (!this.historyArchive || !this.historyCrypto || pending !== null) return null
        await this.checkHistoryKey(idpUrl, accessToken)
        const { standing, key } = this.holding
        if (!actsOnApproval(standing) || !key) return null
        return { generation: key.generation, approvalKey: this.sealer().derive(key.hak).approvalPublicKey }
    }

    /** `null` when the kept revocations can't be read: losing them would trust a device revoked before. */
    private withTrustRows<T>(
        decide: (trust: DeviceTrust) => { change: Partial<DeviceTrust>; result: T },
    ): Promise<{ result: T; trust: DeviceTrust } | null> {
        const run = this.trustTurn.then(async () => {
            const { trust, unreadable } = await this.storage.loadDeviceTrust()
            if (unreadable.includes("revoked")) {
                // eslint-disable-next-line no-console
                console.warn("[e2ee] the revocations kept can't be read: this review decides nothing")
                return null
            }
            const { change, result } = decide(trust)
            return { result, trust: await this.storage.addToDeviceTrust(change) }
        })
        this.trustTurn = run.catch(() => undefined)
        return run
    }

    private warnOfReset(listed: readonly KnownDevice[], trust: DeviceTrust, thisDevice: DeviceId, pending: number | null): void {
        const reset = this.reset && resetByUnapproved(this.reset, listed, trust, thisDevice, pending) ? this.reset : null
        this.withdraw((event) => event.kind === "reset-by-unapproved" && event.generation !== reset?.generation)
        if (reset) this.stand({ kind: "reset-by-unapproved", generation: reset.generation, setByDevice: reset.setByDevice })
    }

    /** `trust` as it can still be acted on: not once this device holds another generation, or none. */
    private actingNow(trust: DeviceTrustVerdict | null): DeviceTrustVerdict | null {
        if (!trust?.acting) return trust
        const { standing, key } = this.holding
        if (actsOnApproval(standing) && key?.generation === trust.generation) return trust
        return { ...trust, acting: false }
    }

    async removeUntrustedLeaves(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        trust: DeviceTrustVerdict | null,
        reviewAgain?: () => Promise<DeviceTrustVerdict | null>,
    ): Promise<{ removed: number }> {
        await this.ensureInitialized(null)
        return this.inGroup(conversationId, async () => {
            const me = await this.storage.getBoundActorUri()
            if (!me || !(await this.mls.hasGroup(conversationId))) return { removed: 0 }
            let verdict = this.actingNow(trust)
            let reviewed = !reviewAgain
            let trying: string | null = null
            try {
                const removed = await this.commitEach(idpUrl, accessToken, conversationId, async () => {
                    for (;;) {
                        const next = await this.leafToCommitOut(conversationId, me, verdict)
                        if (!next) return null
                        if (next.judgement.grounds === "approval" && !reviewed && reviewAgain) {
                            reviewed = true
                            verdict = this.actingNow(await reviewAgain())
                            continue
                        }
                        this.recordUntrusted(conversationId, next.leaf, next.judgement.reason)
                        trying = `${conversationId}:${leafFingerprint(next.leaf)}`
                        return { commit: await this.mls.removeMember(conversationId, next.leaf.leafIndex) }
                    }
                })
                return { removed }
            } catch (error) {
                if (trying && refusedForGood(error) && !(error instanceof IdpError && error.status === 409)) {
                    this.refusedCommitOuts.add(trying)
                }
                throw error
            }
        })
    }

    /**
     * Every non-own leaf of the group as it stands now judged (`judgeLeaf`), its records kept in step,
     * and the first to commit out — a recorded index may hold another leaf by now.
     */
    private async leafToCommitOut(conversationId: ConversationId, me: ActorUri, trust: DeviceTrustVerdict | null) {
        await this.forgetLeavesGone(conversationId)
        const judged = []
        for (const leaf of await this.mls.groupLeaves(conversationId)) {
            if (leaf.own) continue
            const judgement = judgeLeaf(await this.verifyLeaf(leaf), me, trust)
            if (judgement.outcome === "trusted") this.dropLeafRecord(`${conversationId}:${leaf.leafIndex}`)
            // One going on approval grounds is recorded as it goes: the list read again may still approve it.
            else if (judgement.outcome === "warn" || (judgement.outcome === "remove" && judgement.grounds === "forged")) {
                this.recordUntrusted(conversationId, leaf, judgement.reason)
            }
            const refused = this.refusedCommitOuts.has(`${conversationId}:${leafFingerprint(leaf)}`)
            judged.push({ leaf, judgement, refused })
        }
        return firstToCommitOut(judged)
    }

    // ─── The history key and its archive ──────────────────────────────

    private archiveBuffer: Array<{
        conversationId: ConversationId
        entryId: string
        plaintext: Uint8Array
    }> = []
    // A sent message is queued by the send's answer and by its echo, whichever comes first.
    private archivedIds = new Set<string>()
    private flushing: Promise<void> | null = null
    private flushTimer: ReturnType<typeof setInterval> | null = null
    private flushIdpUrl: string | null = null
    private flushAccessToken: (() => string | null) | null = null

    /** The standing and, while it holds, the key it holds: replaced together, never half. */
    private holding: Holding = UNCHECKED
    // The first check is a flow's, after the naming: before it, a pending key may still be promoted.
    private checkedOnce = false
    private checking: Promise<HistoryKeyStanding> | null = null
    private minted: { generation: number; minting: Promise<{ words: string[]; key: HistoryKey }> } | null = null
    /** HAKs by a digest of their words and salt, in flight included: one Argon2id run each. */
    private readonly derivations = new Map<string, Promise<Uint8Array>>()
    // One writer of the passphrase rows at a time within the page; another tab is caught by re-reading.
    private passphraseTurn: Promise<unknown> = Promise.resolve()

    bufferForArchive(conversationId: ConversationId, entryId: string, entry: ArchiveEnvelope): void {
        if (!this.historyArchive || !this.historyCrypto) return
        if (!buffersForArchive(this.holding.standing) || this.archivedIds.has(entryId)) return
        this.archivedIds.add(entryId)
        const plaintext = new TextEncoder().encode(encodeArchiveEnvelope(entry))
        this.archiveBuffer.push({ conversationId, entryId, plaintext })
        this.boundArchiveBuffer()
        if (this.archiveBuffer.length >= 10) void this.flushArchiveNow()
    }

    bufferEditForArchive(conversationId: ConversationId, editCiphertext: Uint8Array, entry: ArchiveEnvelope): void {
        this.bufferForArchive(conversationId, editEntryId(sha256(editCiphertext)), entry)
    }

    private boundArchiveBuffer(): void {
        const over = this.archiveBuffer.length - ARCHIVE_BUFFER_LIMIT
        if (over > 0) this.archiveBuffer.splice(0, over)
    }

    startFlushing(idpUrl: string, accessToken: () => string | null): void {
        this.flushIdpUrl = idpUrl
        this.flushAccessToken = accessToken
        if (this.flushTimer || !this.historyArchive) return
        this.flushTimer = setInterval(() => {
            void this.flushArchiveNow()
        }, 2000)
    }

    // The key held stays: a flow may be using it, and the next start checks it again.
    stopFlushing(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer)
            this.flushTimer = null
        }
        this.flushIdpUrl = null
        this.flushAccessToken = null
    }

    mintHistoryKey(generation: number): Promise<{ words: string[]; key: HistoryKey }> {
        if (this.minted?.generation === generation) return this.minted.minting
        const minted = { generation, minting: this.mint(generation) }
        this.minted = minted
        minted.minting.catch(() => {
            if (this.minted === minted) this.minted = null
        })
        return minted.minting
    }

    private async mint(generation: number): Promise<{ words: string[]; key: HistoryKey }> {
        // Sealed already for this generation — a try whose answer was lost: the same words, written anew.
        const sealed = await this.storage.loadPendingPassphrase()
        if (sealed?.key.generation === generation) {
            await this.inPassphraseTurn(() => this.storage.savePendingPassphrase({ ...sealed, mintedAt: Date.now() }))
            return { words: sealed.words, key: sealed.key }
        }
        const words = generateMnemonic(wordlist, 256).split(" ")
        const salt = crypto.getRandomValues(new Uint8Array(HISTORY_SALT_BYTES))
        const hak = await this.hakFor(words, salt)
        const key = { generation, salt, ...this.sealer().derive(hak) }
        await this.inPassphraseTurn(() => this.storage.savePendingPassphrase({ words, key, hak, mintedAt: Date.now() }))
        return { words, key }
    }

    async pendingHistoryKey(): Promise<PendingHistoryKey | null> {
        const pending = await this.storage.loadPendingPassphrase()
        return pending && { ...pending.key, mintedAt: pending.mintedAt }
    }

    promotePendingHistoryKey(options: { show?: boolean } = {}): Promise<void> {
        return this.inPassphraseTurn(async () => {
            const before = await this.storage.loadKeptPassphrase()
            const pending = await this.storage.loadPendingPassphrase()
            if (!pending) return
            // Marked before keeping: words kept unmarked would never be shown again.
            if (options.show) await this.storage.saveNewWordsGeneration(pending.key.generation)
            await this.keepUnderTurn(pending.words, pending.key, pending.hak, before)
            await this.storage.clearPendingPassphrase()
        })
    }

    async dropPendingHistoryKey(): Promise<void> {
        const minted = this.minted
        this.minted = null
        const forgotten = await minted?.minting.catch(() => null)
        if (forgotten) this.derivations.delete(derivationId(forgotten.words, forgotten.key.salt))
        await this.inPassphraseTurn(async () => {
            const pending = await this.storage.loadPendingPassphrase()
            if (pending) this.derivations.delete(derivationId(pending.words, pending.key.salt))
            if (pending && (await this.storage.loadNewWordsGeneration()) === pending.key.generation) {
                await this.storage.clearNewWordsGeneration()
            }
            await this.storage.clearPendingPassphrase()
        })
    }

    async newWordsToShow(): Promise<{ generation: number; words: string[] } | null> {
        const generation = await this.storage.loadNewWordsGeneration()
        if (generation === null || (await this.storage.loadPendingPassphrase())) return null
        const kept = await this.storage.loadKeptPassphrase()
        return kept?.generation === generation ? { generation, words: kept.words } : null
    }

    dismissNewWords(): Promise<void> {
        return this.storage.clearNewWordsGeneration()
    }

    async deriveHistoryKey(words: string[], salt: Uint8Array): Promise<DerivedHistoryKey> {
        return this.sealer().derive(await this.hakFor(words, salt))
    }

    keepPassphrase(words: string[], key: HistoryKey): Promise<void> {
        return this.inPassphraseTurn(async () => {
            const before = await this.storage.loadKeptPassphrase()
            await this.keepUnderTurn(words, key, await this.hakFor(words, key.salt), before)
        })
    }

    private async keepUnderTurn(
        words: string[],
        key: HistoryKey,
        hak: Uint8Array,
        before: KeptPassphrase | null,
    ): Promise<void> {
        const seen = await this.storage.loadNewestHistoryGeneration()
        if (seen !== null && key.generation < seen) throw new Error("This history key is older than one already seen")
        if (passphraseVerdict(this.sealer().derive(hak), key) !== "holds") {
            throw new Error("These words don't give the account's history key")
        }
        const approvedRootKey = approvalCarriedOver(before, words, key.generation)
        const kept = { words: [...words], generation: key.generation, approvedRootKey, derived: { salt: key.salt, hak } }
        // Another tab may have kept words since this one started.
        const now = await this.storage.loadKeptPassphrase()
        if (!sameKeptWords(now, before)) {
            if (!now || !sameWords(now.words, words) || now.generation !== key.generation) {
                throw new Error("Another tab kept other words meanwhile")
            }
        } else {
            await this.storage.saveKeptPassphrase(kept)
        }
        await this.seeGeneration(seen, key)
        const settled = isSettled(approvedRootKey, await this.rootKey())
        await this.setHolding({ kind: "holds", generation: key.generation, settled }, { generation: key.generation, hak })
    }

    async newestHistoryGeneration(): Promise<number | null> {
        return this.storage.loadNewestHistoryGeneration()
    }

    checkHistoryKey(idpUrl: string, accessToken: string): Promise<HistoryKeyStanding> {
        this.checking ??= this.inPassphraseTurn(() => this.doCheckHistoryKey(idpUrl, accessToken)).finally(() => {
            this.checking = null
        })
        return this.checking
    }

    private async doCheckHistoryKey(idpUrl: string, accessToken: string): Promise<HistoryKeyStanding> {
        const key = await this.archive().getKey(idpUrl, accessToken)
        const kept = await this.storage.loadKeptPassphrase()
        const seen = await this.storage.loadNewestHistoryGeneration()
        const facts = kept && {
            generation: kept.generation,
            salt: kept.derived.salt,
            approvedRootKey: kept.approvedRootKey,
            ...this.sealer().derive(kept.derived.hak),
        }
        const standing = standingAgainst(key, facts, seen, await this.rootKey())
        this.reset = resetSince(key, kept?.generation ?? null, seen)
        await this.seeGeneration(seen, key)
        const held = standing.kind === "holds" && kept ? { generation: standing.generation, hak: kept.derived.hak } : null
        return this.setHolding(standing, held)
    }

    async historyKeyStanding(): Promise<HistoryKeyStanding> {
        if (this.holding.standing.kind !== "unchecked") return this.holding.standing
        return (await this.storage.loadHistoryKeyStanding()) ?? this.holding.standing
    }

    async recordAdmission(admission: Admission): Promise<void> {
        try {
            await this.storage.saveAdmission(admission)
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[history-key] recording the admission failed", e)
        }
    }

    recordedAdmission(): Promise<Admission | null> {
        return this.storage.loadAdmission()
    }

    async signPassphraseApproval(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ deviceId: DeviceId; generation: number; signature: Uint8Array; rootKey: Uint8Array }> {
        if (this.holding.standing.kind === "unchecked") await this.checkHistoryKey(idpUrl, accessToken)
        const held = this.holding.key
        if (!held) throw new Error("This device holds no current history passphrase")
        const attestation = await this.storage.loadDeviceAttestation()
        if (!attestation) throw new Error("This device has no root key yet")
        const deviceId = await this.storage.getOrCreateDeviceId()
        const rootKey = attestation.drk_public
        const signature = this.sealer().signApproval(held.hak, approvalBytes(actorUri, deviceId, rootKey))
        return { deviceId, generation: held.generation, signature, rootKey }
    }

    recordPassphraseApproval(generation: number, rootKey: Uint8Array): Promise<void> {
        return this.inPassphraseTurn(async () => {
            const held = this.holding.key
            const kept = await this.storage.loadKeptPassphrase()
            // Words replaced meanwhile, here or on another tab, weren't the ones approved.
            if (!held || !kept || kept.generation !== generation || !equalBytes(kept.derived.hak, held.hak)) return
            await this.storage.saveKeptPassphrase({ ...kept, approvedRootKey: rootKey })
            const { standing } = this.holding
            if (standing.kind === "holds" && standing.generation === generation) {
                await this.setHolding({ ...standing, settled: isSettled(rootKey, await this.rootKey()) }, held)
            }
        })
    }

    async loadStoredPassphrase(): Promise<string[] | null> {
        return (await this.storage.loadKeptPassphrase())?.words ?? null
    }

    async restoreHistory(
        idpUrl: string,
        accessToken: string,
    ): Promise<{ entries: ArchivedEntry[]; skipped: number }> {
        if (this.holding.standing.kind === "unchecked") await this.checkHistoryKey(idpUrl, accessToken)
        const held = this.holding.key
        if (!held) throw new Error("This device holds no current history passphrase")
        const archive = this.archive()
        const sealer = this.sealer()

        const entries: ArchivedEntry[] = []
        let skipped = 0
        let cursor: { after_id: string; after_created_at: string } | null = null
        do {
            const page = await archive.downloadPage(idpUrl, accessToken, cursor, 100)
            for (const entry of page.entries) {
                let plain: Uint8Array
                try {
                    // Under the ids the row carries: an entry moved to others fails its tag.
                    const aad = archiveEntryAad(entry.conversation_id, entry.id)
                    plain = await sealer.decrypt(held.hak, entry.ciphertext, entry.nonce, aad)
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

    private async setHolding(standing: HistoryKeyStanding, key: HeldKey | null): Promise<HistoryKeyStanding> {
        this.holding = { standing, key }
        this.checkedOnce = true
        if (!actsOnApproval(standing)) this.withdrawUnapproved()
        if (!buffersForArchive(standing)) this.archiveBuffer = []
        if (standing.kind === "holds") {
            this.reset = null
            this.withdraw((event) => event.kind === "share-refused")
        }
        this.withdraw((event) => event.kind === "reset-by-unapproved" && event.generation !== this.reset?.generation)
        const changed = keyChangedUnder(standing)
        const changedKey = changed && trustEventKey(changed)
        this.withdraw(
            (event) => (event.kind === "approval-key-differs" || event.kind === "key-replaced") && trustEventKey(event) !== changedKey,
        )
        if (changed) this.stand(changed)
        try {
            await this.storage.saveHistoryKeyStanding(standing)
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[history-key] recording the standing failed", e)
        }
        return standing
    }

    private async seeGeneration(seen: number | null, key: HistoryKey | null): Promise<void> {
        const newest = newestGenerationSeen(seen, key)
        if (newest !== null && newest !== seen) await this.storage.saveNewestHistoryGeneration(newest)
    }

    private async rootKey(): Promise<Uint8Array | null> {
        return (await this.storage.loadDeviceAttestation())?.drk_public ?? null
    }

    private hakFor(words: string[], salt: Uint8Array): Promise<Uint8Array> {
        const id = derivationId(words, salt)
        let hak = this.derivations.get(id)
        if (!hak) {
            const deriving = this.sealer().deriveKey(words, salt)
            deriving.catch(() => {
                if (this.derivations.get(id) === deriving) this.derivations.delete(id)
            })
            this.derivations.set(id, deriving)
            hak = deriving
        }
        return hak
    }

    private inPassphraseTurn<T>(work: () => Promise<T>): Promise<T> {
        const run = this.passphraseTurn.then(work)
        this.passphraseTurn = run.catch(() => undefined)
        return run
    }

    private archive(): IHistoryArchivePort {
        if (!this.historyArchive) throw new Error("No history archive is wired")
        return this.historyArchive
    }

    private sealer(): HistoryArchiveAdapter {
        if (!this.historyCrypto) throw new Error("No history archive is wired")
        return this.historyCrypto
    }

    /** One drain at a time: the timer and a full buffer both ask for one. */
    private flushArchiveNow(): Promise<void> {
        // A turn later, so entries queued in one go — a history page's — leave as one batch.
        this.flushing ??= Promise.resolve()
            .then(() => this.drainArchive())
            .finally(() => {
                this.flushing = null
            })
        return this.flushing
    }

    // On stale_history_key the key is read again and the batch sent again once; a second stale waits for the next flush.
    private async drainArchive(): Promise<void> {
        let staleOnce = false
        while (this.archiveBuffer.length > 0) {
            const idpUrl = this.flushIdpUrl
            const accessToken = this.flushAccessToken?.()
            if (!this.historyArchive || !this.historyCrypto || !idpUrl || !accessToken) return
            if (this.holding.standing.kind === "unchecked") {
                if (!this.checkedOnce || !(await this.recheck(idpUrl, accessToken))) return
            }
            const holding = this.holding
            if (!holding.key) return
            const batch = this.archiveBuffer.splice(0, ARCHIVE_UPLOAD_LIMIT)
            try {
                await this.uploadSealed(idpUrl, accessToken, holding.key, batch)
            } catch (err) {
                if (isStaleHistoryKey(err)) {
                    this.archiveBuffer.unshift(...batch)
                    this.boundArchiveBuffer()
                    if (this.holding === holding) this.holding = UNCHECKED
                    if (staleOnce) return
                    staleOnce = true
                    continue
                }
                if (refusedForGood(err)) {
                    // eslint-disable-next-line no-console
                    console.warn("[history-archive] the IdP refused a batch; dropping it", err)
                    continue
                }
                // eslint-disable-next-line no-console
                console.warn("[history-archive] flush failed; re-buffering", err)
                this.archiveBuffer.unshift(...batch)
                this.boundArchiveBuffer()
                return
            }
        }
    }

    private async recheck(idpUrl: string, accessToken: string): Promise<boolean> {
        try {
            await this.checkHistoryKey(idpUrl, accessToken)
            return true
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[history-key] reading the history key failed; tried again at the next flush", err)
            return false
        }
    }

    private async uploadSealed(
        idpUrl: string,
        accessToken: string,
        held: HeldKey,
        batch: Array<{ conversationId: ConversationId; entryId: string; plaintext: Uint8Array }>,
    ): Promise<void> {
        const sealer = this.sealer()
        const entries = await Promise.all(
            batch.map(async (e) => {
                const aad = archiveEntryAad(e.conversationId, e.entryId)
                const { ciphertext, nonce } = await sealer.encrypt(held.hak, e.plaintext, aad)
                return { id: e.entryId, conversation_id: e.conversationId, ciphertext, nonce }
            }),
        )
        await this.archive().uploadBatch(idpUrl, accessToken, held.generation, entries)
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
        // A success stands for the page load; a failure is tried again by the next caller.
        if (this.registerPromise) return this.registerPromise
        this.registerPromise = this.doRegister(idpUrl, accessToken, actorUri)
        try {
            return await this.registerPromise
        } catch (e) {
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

        const deviceId = await this.storage.getOrCreateDeviceId()
        let keypair = await this.storage.loadIdentityKeypair()
        if (!keypair) {
            keypair = this.identity.generate()
            await this.storage.saveIdentityKeypair(keypair)
        }
        // A reload topping the stash up past its threshold would mint the difference each time: only the refill's rule publishes.
        await this.replenishKeyPackages(idpUrl, accessToken, actorUri)
        return {
            device_id: deviceId,
            fingerprint: this.identity.fingerprint(keypair.msk_public),
        }
    }

    /** The engine's identity bound to this account, and the storage marked as its, for the gate's check on the next load. */
    private async bindToAccount(actorUri: ActorUri): Promise<void> {
        await this.ensureInitialized(actorUri)
        if ((await this.storage.getBoundActorUri()) !== actorUri) await this.storage.setBoundActorUri(actorUri)
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
        this.holding = UNCHECKED
        this.checkedOnce = false
        this.minted = null
        this.derivations.clear()
        this.archiveBuffer = []
        this.archivedIds.clear()
        this.reset = null
        this.trustEvents.clear()
        this.untrustedLeaves.clear()
        this.leafVerdicts.clear()
        this.rootChecks.clear()
        this.refusedCommitOuts.clear()
        await this.mls.resetProvider()
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
        await this.bindToAccount(actorUri)
        const status = await this.directory.getKeyPackageStatus(idpUrl, accessToken)
        const deviceId = await this.storage.getOrCreateDeviceId()
        const myDevice = status.devices.find((d) => d.device_id === deviceId)

        // Never published any, or flagged at the threshold: both refill to the cap (§ 3.5).
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

    // ─── The code handshake (`identity-provider/specs/e2ee.md § 3.10`) ─────

    newApprovalCode(): string {
        return newApprovalCode()
    }

    async startApprovalHandshake(input: {
        role: HandshakeRole
        code: string
        requestId: string
        actorUri: ActorUri
        peerDeviceId: DeviceId | null
    }): Promise<ApprovalHandshakeSession> {
        const attestation = await this.storage.loadDeviceAttestation()
        if (!attestation?.hpke) throw new Error("This device has no root key or HPKE key yet")
        const deviceId = await this.storage.getOrCreateDeviceId()
        const own = { rootKey: attestation.drk_public, hpkeKey: attestation.hpke.public_key }
        return ApprovalHandshake.start({ ...input, deviceId, own })
    }

    async checkHandshakePeer(
        actorUri: ActorUri,
        peer: HandshakePartner,
        devices: readonly DeviceListEntry[],
    ): Promise<{ ok: true } | { ok: false; reason: HandshakeKeysRefusal | "unsettled" }> {
        const trust = await this.readTrust()
        // Losing the revocations kept would trust a device revoked before: nothing is decided.
        if (!trust) return { ok: false, reason: "unsettled" }
        const refuse = (reason: HandshakeKeysRefusal) => {
            const event = { kind: "handshake-keys-refused" as const, deviceId: peer.deviceId, reason }
            this.withdraw((e) => e.kind === event.kind && e.deviceId === peer.deviceId && e.reason !== reason)
            this.stand(event)
            return { ok: false as const, reason }
        }
        const listed = peerAgainstList(devices, peer, trust.revoked)
        if (listed === "duplicated") {
            this.stand({ kind: "device-list-refused", duplicates: duplicateDeviceIds(devices.map((d) => d.device_id)) })
            return { ok: false, reason: "unsettled" }
        }
        if (listed) return refuse(listed)
        const row = devices.find((d) => d.device_id === peer.deviceId) as DeviceListEntry
        const root = await verifyDeviceRoot(actorUri, row, this.jwks)
        if (root.ok) {
            this.withdraw((e) => e.kind === "handshake-keys-refused" && e.deviceId === peer.deviceId)
            return { ok: true }
        }
        if (root.reason === "unreachable" || root.reason === "expired") return { ok: false, reason: "unsettled" }
        return refuse(root.reason === "revoked" ? "revoked" : "attestation")
    }

    async signDeviceApproval(actorUri: ActorUri, deviceId: DeviceId, rootKey: Uint8Array): Promise<Uint8Array> {
        const attestation = await this.storage.loadDeviceAttestation()
        if (!attestation) throw new Error("This device has no root key yet")
        return ed25519.sign(approvalBytes(actorUri, deviceId, rootKey), attestation.drk_private)
    }

    async approvesThisDevice(actorUri: ActorUri, approverRootKey: Uint8Array, signature: Uint8Array): Promise<boolean> {
        const attestation = await this.storage.loadDeviceAttestation()
        if (!attestation) return false
        const deviceId = await this.storage.getOrCreateDeviceId()
        return verifyStrict(signature, approvalBytes(actorUri, deviceId, attestation.drk_public), approverRootKey)
    }

    async rememberHandshakePartner(partner: HandshakePartner): Promise<void> {
        const run = this.trustTurn.then(() => this.storage.addToDeviceTrust({ partners: [partner] }))
        this.trustTurn = run.catch(() => undefined)
        await run
    }

    async handshakePartners(): Promise<HandshakePartner[]> {
        return (await this.readTrust())?.partners ?? []
    }

    async checkHandshakePartners(
        actorUri: ActorUri,
        devices: readonly DeviceListEntry[],
    ): Promise<{ partners: CheckedPartner[]; revokedSeen: DeviceId[] } | null> {
        const revoked = devices.filter((d) => d.revoked_at !== null).map((d) => d.device_id)
        const twice = duplicateDeviceIds(devices.map((d) => d.device_id)).length > 0
        // A revocation is final (§ 3.9): kept as soon as seen, but not from a list refused whole.
        const trust = twice ? await this.readTrust() : (await this.withTrustRows(() => ({ change: { revoked }, result: null })))?.trust
        if (!trust) return null
        const attestation = await this.storage.loadDeviceAttestation()
        const deviceId = await this.storage.getOrCreateDeviceId()
        // Over the root key this device holds now: an approval of a root key it had before approves nothing.
        const bytes = attestation && approvalBytes(actorUri, deviceId, attestation.drk_public)
        const listed = devices.filter((d) => d.device_id === deviceId).flatMap((d) => d.approvals)
        const partners = trust.partners.map((partner) => ({
            ...partner,
            approvesThisDevice:
                !!bytes &&
                listed.some((a) => a.by === "device" && a.device_id === partner.deviceId && verifyStrict(a.signature, bytes, partner.rootKey)),
        }))
        return { partners, revokedSeen: trust.revoked }
    }

    /** The trust rows as kept, in the rows' turn; `null` when the revocations can't be read. */
    private readTrust(): Promise<DeviceTrust | null> {
        const run = this.trustTurn.then(async () => {
            const { trust, unreadable } = await this.storage.loadDeviceTrust()
            return unreadable.includes("revoked") ? null : trust
        })
        this.trustTurn = run.catch(() => undefined)
        return run
    }

    // ─── Key shares (`identity-provider/specs/e2ee.md § 3.11`) ─────

    /** Recipients the instance refused for good, by device and generation: not sealed for again this page load. */
    private readonly forgoneShares = new Set<string>()

    async sealHistoryShares(actorUri: ActorUri, devices: readonly DeviceListEntry[]): Promise<OutgoingKeyShare[]> {
        const { standing, key } = this.holding
        if (standing.kind !== "holds" || !standing.settled || !key) return []
        const attestation = await this.storage.loadDeviceAttestation()
        if (!attestation) return []
        const duplicates = duplicateDeviceIds(devices.map((d) => d.device_id))
        if (duplicates.length > 0) {
            this.stand({ kind: "device-list-refused", duplicates })
            return []
        }
        // The list's revocations are the review's to keep: read here, never written.
        const trust = await this.readTrust()
        if (!trust) return []
        const thisDevice = await this.storage.getOrCreateDeviceId()
        const { candidates, refused } = shareCandidates({
            partners: trust.partners,
            devices,
            thisDevice,
            generation: key.generation,
            revokedSeen: trust.revoked,
            forgone: (deviceId, generation) => this.forgoneShares.has(`${deviceId}:${generation}`),
        })
        for (const { deviceId, reason } of refused) this.refuseRecipient(deviceId, reason)

        let words: string[] | null | undefined
        const shares: OutgoingKeyShare[] = []
        for (const { partner, row, byThisDevice, byPartner } of candidates) {
            const own = attestation.drk_public
            const ours = byThisDevice.some((a) => verifyApproval(a.signature, actorUri, partner.deviceId, partner.rootKey, own))
            const theirs = byPartner.some((a) => verifyApproval(a.signature, actorUri, thisDevice, own, partner.rootKey))
            if (!ours || !theirs) {
                const which = ours ? "by it of this device" : "by this device of it"
                // eslint-disable-next-line no-console
                console.warn(`[e2ee] the list shows an approval ${which} that doesn't verify: nothing shared with ${partner.deviceId}`)
                continue
            }
            // The row's root key is the exchange's (`shareCandidates`): its HPKE key is checked under that one.
            const chain = await verifyDeviceChain(actorUri, row, this.jwks)
            if (!chain.ok) {
                if (chain.reason === "unreachable" || chain.reason === "expired") continue
                const hpke = chain.reason === "no-hpke-key" || chain.reason === "hpke-signature"
                this.refuseRecipient(partner.deviceId, hpke ? "hpke-key" : "attestation")
                continue
            }
            this.withdraw((e) => e.kind === "share-recipient-refused" && e.deviceId === partner.deviceId)
            words ??= await this.heldWords(key)
            if (!words) return shares
            try {
                shares.push(
                    await sealKeyShare({
                        hpke: this.hpke,
                        actorUri,
                        sender: thisDevice,
                        recipient: partner.deviceId,
                        generation: key.generation,
                        words,
                        recipientHpkeKey: chain.hpkePublicKey,
                        senderRootSecret: attestation.drk_private,
                    }),
                )
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn(`[e2ee] sealing the passphrase for ${partner.deviceId} failed`, e)
            }
        }
        return shares
    }

    /** The words kept, when they are still the ones the held key came from. */
    private async heldWords(key: HeldKey): Promise<string[] | null> {
        const kept = await this.storage.loadKeptPassphrase()
        return kept && kept.generation === key.generation && equalBytes(kept.derived.hak, key.hak) ? kept.words : null
    }

    private refuseRecipient(deviceId: DeviceId, reason: ShareRecipientRefusal): void {
        this.withdraw((e) => e.kind === "share-recipient-refused" && e.deviceId === deviceId && e.reason !== reason)
        this.stand({ kind: "share-recipient-refused", deviceId, reason })
    }

    forgoHistoryShare(recipient: DeviceId, generation: number): void {
        this.forgoneShares.add(`${recipient}:${generation}`)
    }

    async openHistoryShare(
        actorUri: ActorUri,
        share: KeyShare,
        key: HistoryKey,
    ): Promise<{ ok: true; words: string[] } | { ok: false; reason: KeyShareRefusal | "unsettled" }> {
        const trust = await this.readTrust()
        const attestation = await this.storage.loadDeviceAttestation()
        if (!trust || !attestation?.hpke) return { ok: false, reason: "unsettled" }
        const refuse = (reason: KeyShareRefusal) => {
            this.stand({ kind: "share-refused", deviceId: share.senderDeviceId, generation: share.generation, reason })
            return { ok: false as const, reason }
        }
        const partners = trust.revoked.includes(share.senderDeviceId) ? [] : trust.partners.filter((p) => p.deviceId === share.senderDeviceId)
        if (partners.length === 0) return refuse("not-a-partner")
        const opened = await openKeyShare({
            hpke: this.hpke,
            actorUri,
            recipient: await this.storage.getOrCreateDeviceId(),
            share,
            senderRootKeys: partners.map((p) => p.rootKey),
            hpkePrivateKey: attestation.hpke.private_key,
        })
        if (!opened.ok) return refuse(opened.reason)
        const hak = await this.hakFor(opened.words, key.salt)
        const verdict = passphraseVerdict(this.sealer().derive(hak), key)
        if (verdict !== "holds") {
            this.derivations.delete(derivationId(opened.words, key.salt))
            hak.fill(0)
            return refuse(verdict === "wrong" ? "check-value" : "approval-key")
        }
        return opened
    }

    async markHistoryRestoreDue(generation: number): Promise<void> {
        await this.storage.saveRestoreDue({ generation, appliedAt: null })
    }

    historyRestoreDue(): Promise<RestoreDue | null> {
        return this.storage.loadRestoreDue()
    }

    async historyRestoreApplied(generation: number): Promise<void> {
        if ((await this.storage.loadRestoreDue())?.generation !== generation) return
        await this.storage.saveRestoreDue({ generation, appliedAt: new Date().toISOString() })
    }

    async historyRestored(generation: number): Promise<void> {
        if ((await this.storage.loadRestoreDue())?.generation === generation) await this.storage.clearRestoreDue()
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
                const leaves = []
                for (const leaf of await this.mls.groupLeaves(conversationId)) {
                    if (leaf.own) continue
                    const verdict = await this.verifyLeaf(leaf)
                    leaves.push({ leafIndex: leaf.leafIndex, actorUri: leaf.credential?.actor_uri ?? null, origin: leafOrigin(verdict) })
                }
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
        trust: DeviceTrustVerdict,
    ): Promise<{ added: number; unclaimed: DeviceId[] }> {
        // A device-list refresh and a group just held can start runs together; the second finds
        // what the first added.
        return this.inGroup(conversationId, () => this.doAddOwnDevices(idpUrl, accessToken, conversationId, trust))
    }

    private async doAddOwnDevices(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        trust: DeviceTrustVerdict,
    ): Promise<{ added: number; unclaimed: DeviceId[] }> {
        await this.ensureInitialized(null)
        const me = await this.storage.getBoundActorUri()
        const acting = this.actingNow(trust)
        if (!acting?.acting || !me || !(await this.mls.hasGroup(conversationId))) return { added: 0, unclaimed: [] }
        const unavailable = new Set<DeviceId>()
        const unclaimed = new Set<DeviceId>()
        const added = await this.commitEach(idpUrl, accessToken, conversationId, async () => {
            for (;;) {
                const present = []
                for (const leaf of await this.mls.groupLeaves(conversationId)) if (!leaf.own) present.push(await this.verifyLeaf(leaf))
                const [device] = devicesToAdd(present, me, acting).filter((d) => !unavailable.has(d.deviceId))
                if (device === undefined) return null
                let claimed
                try {
                    claimed = await this.directory.claimKeyPackage(idpUrl, accessToken, me, device.deviceId)
                } catch {
                    unavailable.add(device.deviceId)
                    unclaimed.add(device.deviceId)
                    continue
                }
                if (claimed.device_id !== device.deviceId) {
                    unavailable.add(device.deviceId)
                    unclaimed.add(device.deviceId)
                    continue
                }
                const verdict = await this.checkClaim(me, claimed, device.rootKey)
                if (!verdict.ok) {
                    // eslint-disable-next-line no-console
                    console.warn(`addOwnDevices: a KeyPackage of ${device.deviceId} refused (${verdict.reason})`)
                    unavailable.add(device.deviceId)
                    continue
                }
                const out = await this.mls.addMember(conversationId, claimed.key_package)
                return {
                    commit: out.commit,
                    merged: () =>
                        this.directory.postWelcome(idpUrl, accessToken, {
                            recipient_actor_uri: me,
                            recipient_device_id: device.deviceId,
                            conversation_id: conversationId,
                            welcome_blob: out.welcome,
                        }),
                }
            }
        })
        return { added, unclaimed: [...unclaimed] }
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
    ): Promise<{ removed_from: ConversationId[] }> {
        await this.ensureInitialized(actorUri)
        const keeping = this.trustTurn.then(() => this.storage.addToDeviceTrust({ revoked: [deviceId] }))
        this.trustTurn = keeping.catch(() => undefined)
        try {
            await keeping
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("revokeDevice: keeping the revocation failed; the device list brings it again", e)
        }
        this.withdraw((event) => event.kind === "unapproved-device" && event.deviceId === deviceId)

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

        return { removed_from: removed }
    }
}

function sameWords(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((word, i) => word === b[i])
}

function sameKeptWords(a: KeptPassphrase | null, b: KeptPassphrase | null): boolean {
    if (!a || !b) return a === b
    return a.generation === b.generation && sameWords(a.words, b.words)
}

// A digest, not the words: the map outlives the flow that typed them.
function derivationId(words: readonly string[], salt: Uint8Array): string {
    const text = new TextEncoder().encode(words.join(" "))
    const input = new Uint8Array(salt.length + text.length)
    input.set(salt)
    input.set(text, salt.length)
    return bytesToHex(sha256(input))
}

function tell(listener: (event: TrustEvent) => void, event: TrustEvent): void {
    try {
        listener(event)
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("onTrustEvent listener failed:", e)
    }
}

/** A record is about this very leaf: its signature key and its credential as decoded. */
function leafFingerprint(leaf: MlsLeaf): string {
    return `${bytesToBase64(leaf.signatureKey)}:${JSON.stringify(leaf.credential)}`
}
