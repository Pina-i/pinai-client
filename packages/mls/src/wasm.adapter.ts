/**
 * The WASM implementation of `IMlsEngine`: a thin TypeScript wrapper around
 * the openmls bundle.
 *
 * One of the engine implementations, not the engine. A React Native build
 * supplies a sibling over the same Rust crate compiled natively (Hermes has
 * no WebAssembly) and shares `leaf-credential.ts` with this one. This file is
 * the only place `openmls-wasm` is imported.
 *
 * Holds:
 * - One {@link Provider} per session (in-memory keystore + RNG;
 *   `storage.adapter.ts` will checkpoint to IndexedDB).
 * - The bound {@link Identity}: the leaf credential this device's KeyPackages carry.
 * - A `Map<conversationId, Group>` of live group handles.
 *
 * It is the bundle's HPKE too ({@link IHpkePort}), so one load serves both.
 *
 * All bytes-in / bytes-out — `mls_ciphertext` from the wire feeds
 * straight into {@link MlsAdapter.processMessage}, and outputs of
 * {@link MlsAdapter.encryptApplication} / {@link MlsAdapter.addMember} /
 * etc. are ready for the IdP REST surface as-is.
 */

import init, {
    Group,
    type GroupMember,
    Identity,
    KeyPackage,
    ProcessedKind,
    Provider,
    hpke_generate_key_pair,
    hpke_open,
    hpke_seal,
    start as wasmStart,
} from "openmls-wasm"

import type { ActorUri, ConversationId, DeviceId } from "@pinai/domain/models/e2ee"
import type { GroupLeaf } from "@pinai/domain/models/group"
import type { LeafClaim, LeafCredential, MlsLeaf } from "@pinai/domain/models/leaf-trust"
import type { HpkeKeyPair, HpkeSealed, IHpkePort } from "@pinai/domain/ports/hpke.port"
import { decodeLeafCredential, encodeLeafCredential } from "./leaf-credential"
import type {
    AddMemberOutput,
    IMlsEngine,
    MlsCiphertext,
    ProcessOutcome,
} from "@pinai/domain/ports/mls-engine.port"

export type { AddMemberOutput, MlsCiphertext, ProcessOutcome }

export class MlsAdapter implements IMlsEngine, IHpkePort {
    /** Set after {@link MlsAdapter.init}. */
    private provider: Provider | null = null
    /** Set after {@link MlsAdapter.setIdentity}. */
    private identity: Identity | null = null
    /** Open MLS groups, keyed by `conversation_id`. */
    private readonly groups = new Map<ConversationId, Group>()
    /**
     * Cached in-flight `initialize()` promise. Guards against two
     * concurrent callers (e.g. React strict-mode double-fire of the
     * onboarding bootstrap + `useConsumeMlsWelcomes` effects) both
     * passing the `if (this.provider)` short-circuit and ending up
     * with two `new Provider()` instances — the second silently
     * orphans the first, so any `Identity` already bound against the
     * first provider's storage can no longer find its keypair.
     */
    private initPromise: Promise<void> | null = null

    /**
     * Load the WASM bundle and mount the Rust panic hook. Idempotent
     * and race-safe: concurrent callers all await the same single
     * `init` + `new Provider()` step.
     *
     * `wasmInput` is forwarded to wasm-bindgen's `init` — left empty
     * the bundle uses its default URL relative to the .js glue. Tests
     * pass a `WebAssembly.Module` to avoid the network round-trip.
     */
    /**
     * Drop the in-memory provider, identity, and group caches. Called
     * by `E2eeAdapter.wipeLocalDevice` when a different user logs in
     * on the same browser — without this, a stale `Provider` instance
     * holding the previous user's group state would race the wiped
     * IDB on the next op.
     */
    async resetProvider(): Promise<void> {
        this.provider = null
        this.identity = null
        this.groups.clear()
        this.initPromise = null
    }

    async initialize(wasmInput?: Parameters<typeof init>[0]): Promise<void> {
        if (this.provider) return
        if (!this.initPromise) {
            this.initPromise = (async () => {
                await init(wasmInput as never)
                wasmStart()
                this.provider = new Provider()
            })()
        }
        return this.initPromise
    }

    async generateSignatureKey(): Promise<Uint8Array> {
        return Identity.generate_signature_key(this.requireProvider())
    }

    /** Fails when the key isn't in the provider's storage: made here, or restored with a snapshot. */
    async setIdentity(credential: LeafCredential, signatureKey: Uint8Array): Promise<void> {
        const bound = Identity.bind(this.requireProvider(), encodeLeafCredential(credential), signatureKey)
        this.identity?.free()
        this.identity = bound
    }

    /**
     * Reused across reloads, so new KeyPackages keep the key a group's leaf carries instead of
     * minting one on every mount. Groups joined through KeyPackages of different binds carry
     * different keys; any of them will do, since each group signs with its own leaf's key.
     */
    async ownLeafSignatureKey(): Promise<Uint8Array | null> {
        for (const group of this.groups.values()) {
            const own = group.own_leaf_index()
            const leaf = group.list_members().find((m) => m.leaf_index === own)
            if (leaf) return leaf.signature_public_key
        }
        return null
    }

    /** Ed25519 public key of the leaf — used for the device fingerprint UI. */
    async getDeviceSignaturePublicKey(): Promise<Uint8Array> {
        return this.requireIdentity().signature_public_key()
    }

    /**
     * Build a fresh single-use KeyPackage for upload to the IdP. Each
     * call produces an independent bundle — caller batches them into
     * `POST /api/keys/packages`.
     */
    async createKeyPackage(): Promise<Uint8Array> {
        const id = this.requireIdentity()
        const kp = id.key_package(this.requireProvider())
        return kp.to_bytes()
    }

    /** Validated first: the protocol version, ciphersuite and LeafNode signature. */
    async inspectKeyPackage(keyPackageBytes: Uint8Array): Promise<LeafClaim> {
        const keyPackage = KeyPackage.from_bytes(keyPackageBytes)
        try {
            return {
                credential: decodeLeafCredential(keyPackage.credential_bytes()),
                signatureKey: keyPackage.signature_public_key(),
            }
        } finally {
            keyPackage.free()
        }
    }

    // ─── Group lifecycle ─────────────────────────────────────────────

    /**
     * Brand-new group. The founder is the only member; bring others in
     * via {@link MlsAdapter.addMember}.
     */
    async createGroup(conversationId: ConversationId): Promise<void> {
        if (this.groups.has(conversationId)) {
            throw new Error(`MLS group already exists for ${conversationId}`)
        }
        const groupId = encodeGroupId(conversationId)
        const group = Group.create_new(this.requireProvider(), this.requireIdentity(), groupId)
        this.groups.set(conversationId, group)
    }

    /**
     * Join a group from a Welcome we received. `ratchetTreeBytes` is
     * optional — when the inviter built the group with the ratchet-
     * tree extension on (the default in this adapter), the tree
     * travels inside the welcome and the joiner can pass `null`.
     */
    async joinGroup(
        conversationId: ConversationId,
        welcomeBytes: Uint8Array,
        ratchetTreeBytes?: Uint8Array | null,
    ): Promise<void> {
        if (this.groups.has(conversationId)) {
            throw new Error(`MLS group already exists for ${conversationId}`)
        }
        const group = Group.join(
            this.requireProvider(),
            welcomeBytes,
            ratchetTreeBytes ?? null,
        )
        this.groups.set(conversationId, group)
    }

    async rejoinGroup(conversationId: ConversationId, welcomeBytes: Uint8Array): Promise<boolean> {
        const held = this.requireGroup(conversationId)
        const group = held.rejoin(this.requireProvider(), welcomeBytes)
        if (!group) return false
        held.free()
        this.groups.set(conversationId, group)
        return true
    }

    async deleteGroup(conversationId: ConversationId): Promise<void> {
        const group = this.groups.get(conversationId)
        if (!group) return
        group.delete(this.requireProvider())
        group.free()
        this.groups.delete(conversationId)
    }

    /** True if this device holds an MLS group state for the conversation. */
    async hasGroup(conversationId: ConversationId): Promise<boolean> {
        return this.groups.has(conversationId)
    }

    /** Every conversation we currently hold MLS state for. */
    async knownGroupIds(): Promise<ConversationId[]> {
        return Array.from(this.groups.keys())
    }

    /**
     * Snapshot the provider's MLS storage. Pair with
     * `knownGroupIds` so the rehydration path knows which groups to
     * `Group.load_from_provider` after a fresh `Provider` deserializes
     * the bytes.
     */
    async serializeStorage(): Promise<Uint8Array> {
        return this.requireProvider().serialize_storage()
    }

    /**
     * Restore a provider snapshot + rehydrate the in-memory `Group`
     * handles for every previously-known conversation. Drops any
     * group whose state didn't make it into the snapshot (e.g.
     * the persistence write was racy). After this returns, the
     * adapter is ready to accept ops on those groups again.
     */
    async restoreStorage(snapshot: Uint8Array, knownGroupIds: ConversationId[]): Promise<void> {
        const provider = this.requireProvider()
        provider.deserialize_storage(snapshot)

        this.groups.clear()
        for (const conversationId of knownGroupIds) {
            const groupId = encodeGroupId(conversationId)
            const group = Group.load_from_provider(provider, groupId)
            if (group) this.groups.set(conversationId, group)
        }
    }

    /** Current epoch — used by catch-up logic. */
    async getEpoch(conversationId: ConversationId): Promise<bigint> {
        return this.requireGroup(conversationId).epoch()
    }

    // ─── Membership changes ──────────────────────────────────────────

    /**
     * Add a member by claimed KeyPackage. Returns the Commit + Welcome
     * + ratchet tree for delivery. Caller must {@link MlsAdapter.mergePendingCommit}
     * after the IdP DS confirms the commit landed.
     */
    async addMember(conversationId: ConversationId, peerKeyPackageBytes: Uint8Array): Promise<AddMemberOutput> {
        const group = this.requireGroup(conversationId)
        const keyPackage = KeyPackage.from_bytes(peerKeyPackageBytes)
        const out = group.add_member(this.requireProvider(), keyPackage)
        return {
            commit: out.commit,
            welcome: out.welcome,
            ratchet_tree: group.export_ratchet_tree(),
        }
    }

    async removeMember(conversationId: ConversationId, memberIndex: number): Promise<Uint8Array> {
        const group = this.requireGroup(conversationId)
        return group.remove_member(this.requireProvider(), memberIndex).commit
    }

    /**
     * The leaf whose credential names `(actorUri, deviceId)`, or `null`: the device-revocation
     * flow's way to the leaf to remove.
     */
    async findLeafByDeviceId(
        conversationId: ConversationId,
        actorUri: ActorUri,
        deviceId: DeviceId,
    ): Promise<number | null> {
        const group = this.requireGroup(conversationId)
        const members = group.list_members()
        for (const m of members) {
            const cred = decodeLeafCredential(m.credential_bytes)
            if (cred && cred.actor_uri === actorUri && cred.device_id === deviceId) {
                return m.leaf_index
            }
        }
        return null
    }

    async groupMembers(conversationId: ConversationId): Promise<GroupLeaf[]> {
        const leaves: GroupLeaf[] = []
        for (const m of this.requireGroup(conversationId).list_members()) {
            const cred = decodeLeafCredential(m.credential_bytes)
            if (cred) {
                leaves.push({ leafIndex: m.leaf_index, actorUri: cred.actor_uri, deviceId: cred.device_id })
            }
        }
        return leaves
    }

    async groupLeaves(conversationId: ConversationId): Promise<MlsLeaf[]> {
        const group = this.requireGroup(conversationId)
        const own = group.own_leaf_index()
        return group.list_members().map((m) => mlsLeaf(m, m.leaf_index === own))
    }

    async clearPendingCommit(conversationId: ConversationId): Promise<void> {
        this.requireGroup(conversationId).clear_pending_commit(this.requireProvider())
    }

    /** Self-update — rotates this device's leaf key for PCS. */
    async update(conversationId: ConversationId): Promise<Uint8Array> {
        const group = this.requireGroup(conversationId)
        return group.update(this.requireProvider()).commit
    }

    async updateOwnCredential(conversationId: ConversationId, credential: LeafCredential): Promise<Uint8Array> {
        const group = this.requireGroup(conversationId)
        return group.update_credential(this.requireProvider(), encodeLeafCredential(credential)).commit
    }

    /** After the IdP DS confirms our commit landed, advance our local copy. */
    async mergePendingCommit(conversationId: ConversationId): Promise<void> {
        this.requireGroup(conversationId).merge_pending_commit(this.requireProvider())
    }

    // ─── Application messages ────────────────────────────────────────

    async encryptApplication(conversationId: ConversationId, plaintext: Uint8Array): Promise<MlsCiphertext> {
        const group = this.requireGroup(conversationId)
        return group.encrypt_application(this.requireProvider(), plaintext)
    }

    /**
     * Process any inbound MLS message — application, commit, or
     * proposal — for the named group. Returns a discriminated union
     * the caller can switch on.
     */
    async processMessage(conversationId: ConversationId, msgBytes: Uint8Array): Promise<ProcessOutcome> {
        const group = this.requireGroup(conversationId)
        const processed = group.process_message(this.requireProvider(), msgBytes)
        switch (processed.kind) {
            case ProcessedKind.Application:
                return { kind: "application", plaintext: processed.application }
            case ProcessedKind.Commit:
                return { kind: "commit", leavesMet: processed.leaves_met.map((m) => mlsLeaf(m, false)) }
            case ProcessedKind.Proposal:
                return { kind: "proposal" }
            default:
                throw new Error(`Unknown ProcessedKind: ${processed.kind}`)
        }
    }

    /**
     * Derive a `keyLength`-byte secret from the current epoch. Used by
     * the per-attachment key derivation flow when we'd rather not
     * inline an AES key in the application message.
     */
    async exportSecret(
        conversationId: ConversationId,
        label: string,
        context: Uint8Array,
        keyLength: number,
    ): Promise<Uint8Array> {
        return this.requireGroup(conversationId).export_secret(
            this.requireProvider(),
            label,
            context,
            keyLength,
        )
    }

    // ─── HPKE ────────────────────────────────────────────────────────

    async generateKeyPair(): Promise<HpkeKeyPair> {
        await this.initialize()
        const pair = hpke_generate_key_pair()
        try {
            return { publicKey: pair.public_key, privateKey: pair.private_key }
        } finally {
            pair.free()
        }
    }

    async seal(publicKey: Uint8Array, info: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Promise<HpkeSealed> {
        await this.initialize()
        const sealed = hpke_seal(publicKey, info, aad, plaintext)
        try {
            return { enc: sealed.enc, ciphertext: sealed.ciphertext }
        } finally {
            sealed.free()
        }
    }

    async open(privateKey: Uint8Array, sealed: HpkeSealed, info: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
        await this.initialize()
        return hpke_open(privateKey, sealed.enc, sealed.ciphertext, info, aad)
    }

    // ─── Internals ───────────────────────────────────────────────────

    private requireProvider(): Provider {
        if (!this.provider) throw new Error("MlsAdapter not initialized — call initialize() first")
        return this.provider
    }

    private requireIdentity(): Identity {
        if (!this.identity) throw new Error("MlsAdapter has no identity — call setIdentity() first")
        return this.identity
    }

    private requireGroup(conversationId: ConversationId): Group {
        const group = this.groups.get(conversationId)
        if (!group) throw new Error(`No MLS group state for conversation ${conversationId}`)
        return group
    }
}

function mlsLeaf(member: GroupMember, own: boolean): MlsLeaf {
    return {
        leafIndex: member.leaf_index,
        own,
        signatureKey: member.signature_public_key,
        credential: decodeLeafCredential(member.credential_bytes),
    }
}

/**
 * UUID strings turn into the raw 16-byte UUID encoding for the MLS
 * `group_id`. We never re-use the UUID's hex form on the wire — bytes
 * are smaller and don't depend on string normalisation.
 */
function encodeGroupId(conversationId: ConversationId): Uint8Array {
    const hex = conversationId.replace(/-/g, "")
    if (hex.length !== 32) {
        throw new Error(`Expected UUID conversation_id, got ${conversationId}`)
    }
    const out = new Uint8Array(16)
    for (let i = 0; i < 16; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return out
}
