/**
 * The MLS engine over a build of the Rust crate (`crypto/`): what the client asks of MLS
 * (`IMlsEngine`) and of HPKE (`IHpkePort`), on a bundle's objects (`bundle.ts`). The WASM build
 * (`wasm.adapter.ts`) and the mobile app's native one go through this same code.
 *
 * Holds one provider (keystore + RNG), the bound identity — the leaf credential this device's
 * KeyPackages carry —, the open groups by conversation, and the groups joined by external commit
 * whose commit the DS hasn't taken yet. Bytes in, bytes out: everything is wire format, ready for
 * the IdP's REST surface as it is.
 */

import type { ActorUri, ConversationId, DeviceId } from "@pinai/domain/models/e2ee"
import type { LeafClaim, LeafCredential, MlsLeaf } from "@pinai/domain/models/leaf-trust"
import { refusesExternalCommit } from "@pinai/domain/models/new-device"
import type { HpkeKeyPair, HpkeSealed, IHpkePort } from "@pinai/domain/ports/hpke.port"
import type {
    AddMemberOutput,
    CommitOutput,
    ExternalJoinOutput,
    IMlsEngine,
    MlsCiphertext,
    ProcessOutcome,
} from "@pinai/domain/ports/mls-engine.port"
import type {
    BundleCommitOutput,
    BundleGroup,
    BundleGroupMember,
    BundleIdentity,
    BundleProvider,
    MlsBundle,
} from "./bundle"
import { decodeLeafCredential, encodeLeafCredential } from "./leaf-credential"

export class MlsEngine<LoadInput = void> implements IMlsEngine, IHpkePort {
    /** Loaded once: the code, kept across `resetProvider`. */
    private bundle: MlsBundle | null = null
    private provider: BundleProvider | null = null
    /** Set after {@link MlsEngine.setIdentity}. */
    private identity: BundleIdentity | null = null
    /** Open MLS groups, keyed by `conversation_id`. */
    private readonly groups = new Map<ConversationId, BundleGroup>()
    /** Groups joined by external commit, held once the DS takes the commit. */
    private readonly pendingJoins = new Map<ConversationId, BundleGroup>()
    /**
     * Cached in-flight `initialize()` promise. Guards against two
     * concurrent callers (e.g. React strict-mode double-fire of the
     * onboarding bootstrap + `useConsumeMlsWelcomes` effects) both
     * passing the `if (this.provider)` short-circuit and ending up
     * with two providers — the second silently orphans the first, so
     * any identity already bound against the first provider's storage
     * can no longer find its keypair.
     */
    private initPromise: Promise<void> | null = null
    private readonly load: (input?: LoadInput) => Promise<MlsBundle>

    constructor(load: (input?: LoadInput) => Promise<MlsBundle>) {
        this.load = load
    }

    /**
     * Drop the in-memory provider, identity, and group caches. Called
     * by `E2eeAdapter.wipeLocalDevice` when a different user logs in
     * on the same device — without this, a stale provider holding the
     * previous user's group state would race the wiped storage on the
     * next op.
     */
    async resetProvider(): Promise<void> {
        this.provider = null
        this.identity = null
        this.groups.clear()
        this.pendingJoins.clear()
        this.initPromise = null
    }

    /**
     * Load the bundle the first time — `input` goes to its loader (the WASM's `init`: tests pass a
     * `WebAssembly.Module`) — then a fresh provider. Idempotent and race-safe: concurrent callers
     * all await the same step.
     */
    async initialize(input?: LoadInput): Promise<void> {
        if (this.provider) return
        if (!this.initPromise) {
            this.initPromise = (async () => {
                this.bundle ??= await this.load(input)
                this.provider = new this.bundle.Provider()
            })()
        }
        return this.initPromise
    }

    async generateSignatureKey(): Promise<Uint8Array> {
        return this.requireBundle().Identity.generate_signature_key(this.requireProvider())
    }

    /** Fails when the key isn't in the provider's storage: made here, or restored with a snapshot. */
    async setIdentity(credential: LeafCredential, signatureKey: Uint8Array): Promise<void> {
        const bound = this.requireBundle().Identity.bind(this.requireProvider(), encodeLeafCredential(credential), signatureKey)
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
        const kp = this.requireIdentity().key_package(this.requireProvider())
        try {
            return kp.to_bytes()
        } finally {
            kp.free()
        }
    }

    /** Validated first: the protocol version, ciphersuite and LeafNode signature. */
    async inspectKeyPackage(keyPackageBytes: Uint8Array): Promise<LeafClaim> {
        const keyPackage = this.requireBundle().KeyPackage.from_bytes(keyPackageBytes)
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
     * via {@link MlsEngine.addMember}.
     */
    async createGroup(conversationId: ConversationId): Promise<void> {
        if (this.groups.has(conversationId)) {
            throw new Error(`MLS group already exists for ${conversationId}`)
        }
        const group = this.requireBundle().Group.create_new(
            this.requireProvider(),
            this.requireIdentity(),
            encodeGroupId(conversationId),
        )
        this.groups.set(conversationId, group)
    }

    /**
     * Join a group from a Welcome we received. `ratchetTreeBytes` is
     * optional — every member's Welcomes carry the tree, so the joiner
     * can pass `null`.
     */
    async joinGroup(
        conversationId: ConversationId,
        welcomeBytes: Uint8Array,
        ratchetTreeBytes?: Uint8Array | null,
    ): Promise<void> {
        if (this.groups.has(conversationId)) {
            throw new Error(`MLS group already exists for ${conversationId}`)
        }
        const group = this.requireBundle().Group.join(this.requireProvider(), welcomeBytes, ratchetTreeBytes ?? null)
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

    async joinByExternalCommit(conversationId: ConversationId, groupInfo: Uint8Array): Promise<ExternalJoinOutput> {
        if (this.groups.has(conversationId)) {
            throw new Error(`MLS group already exists for ${conversationId}`)
        }
        if (this.pendingJoins.has(conversationId)) {
            throw new Error(`A join of ${conversationId} is already pending`)
        }
        const join = this.requireBundle().Group.join_by_external_commit(
            this.requireProvider(),
            this.requireIdentity(),
            encodeGroupId(conversationId),
            groupInfo,
        )
        const out = { commit: join.commit, group_info: join.group_info, epoch: join.epoch }
        const group = join.into_group()
        this.pendingJoins.set(conversationId, group)
        const own = group.own_leaf_index()
        return { ...out, leaves: group.list_members().map((m) => mlsLeaf(m, m.leaf_index === own)) }
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
     * load after a fresh provider deserializes the bytes.
     */
    async serializeStorage(): Promise<Uint8Array> {
        return this.requireProvider().serialize_storage()
    }

    /**
     * Restore a provider snapshot + rehydrate the in-memory group
     * handles for every previously-known conversation. Drops any
     * group whose state didn't make it into the snapshot (e.g.
     * the persistence write was racy). After this returns, the
     * engine is ready to accept ops on those groups again.
     */
    async restoreStorage(snapshot: Uint8Array, knownGroupIds: ConversationId[]): Promise<void> {
        const provider = this.requireProvider()
        provider.deserialize_storage(snapshot)

        this.groups.clear()
        this.pendingJoins.clear()
        for (const conversationId of knownGroupIds) {
            const group = this.requireBundle().Group.load_from_provider(provider, encodeGroupId(conversationId))
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
     * + ratchet tree for delivery. Caller must {@link MlsEngine.mergePendingCommit}
     * after the IdP DS confirms the commit landed.
     */
    async addMember(conversationId: ConversationId, peerKeyPackageBytes: Uint8Array): Promise<AddMemberOutput> {
        const group = this.requireGroup(conversationId)
        const keyPackage = this.requireBundle().KeyPackage.from_bytes(peerKeyPackageBytes)
        const out = group.add_member(this.requireProvider(), keyPackage)
        return {
            commit: out.commit,
            group_info: out.group_info,
            welcome: out.welcome,
            ratchet_tree: group.export_ratchet_tree(),
        }
    }

    async removeMember(conversationId: ConversationId, memberIndex: number): Promise<CommitOutput> {
        const group = this.requireGroup(conversationId)
        return commitOutput(group.remove_member(this.requireProvider(), memberIndex))
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
        for (const m of this.requireGroup(conversationId).list_members()) {
            const cred = decodeLeafCredential(m.credential_bytes)
            if (cred && cred.actor_uri === actorUri && cred.device_id === deviceId) {
                return m.leaf_index
            }
        }
        return null
    }

    async groupLeaves(conversationId: ConversationId): Promise<MlsLeaf[]> {
        const group = this.requireGroup(conversationId)
        const own = group.own_leaf_index()
        return group.list_members().map((m) => mlsLeaf(m, m.leaf_index === own))
    }

    async clearPendingCommit(conversationId: ConversationId): Promise<void> {
        const joined = this.pendingJoins.get(conversationId)
        if (joined) {
            this.pendingJoins.delete(conversationId)
            joined.delete(this.requireProvider())
            joined.free()
            return
        }
        this.requireGroup(conversationId).clear_pending_commit(this.requireProvider())
    }

    /** Self-update — rotates this device's leaf key for PCS. */
    async update(conversationId: ConversationId): Promise<CommitOutput> {
        return commitOutput(this.requireGroup(conversationId).update(this.requireProvider()))
    }

    async updateOwnCredential(conversationId: ConversationId, credential: LeafCredential): Promise<CommitOutput> {
        const group = this.requireGroup(conversationId)
        return commitOutput(group.update_credential(this.requireProvider(), encodeLeafCredential(credential)))
    }

    /** After the IdP DS confirms our commit landed, advance our local copy. */
    async mergePendingCommit(conversationId: ConversationId): Promise<void> {
        const joined = this.pendingJoins.get(conversationId)
        if (joined) {
            // openmls merged the join's commit as it made it.
            this.pendingJoins.delete(conversationId)
            this.groups.set(conversationId, joined)
            return
        }
        this.requireGroup(conversationId).merge_pending_commit(this.requireProvider())
    }

    // ─── Application messages ────────────────────────────────────────

    async encryptApplication(conversationId: ConversationId, plaintext: Uint8Array): Promise<MlsCiphertext> {
        return this.requireGroup(conversationId).encrypt_application(this.requireProvider(), plaintext)
    }

    /**
     * Process any inbound MLS message — application, commit, or proposal, which is ignored — for
     * the named group. A commit is applied unless it is an external one removing a leaf of another
     * account than its joiner's: that one is thrown, the group left as it was.
     */
    async processMessage(conversationId: ConversationId, msgBytes: Uint8Array): Promise<ProcessOutcome> {
        const group = this.requireGroup(conversationId)
        const provider = this.requireProvider()
        const kinds = this.requireBundle().ProcessedKind
        const processed = group.process_message(provider, msgBytes)
        try {
            switch (processed.kind) {
                case kinds.Application:
                    return { kind: "application", plaintext: processed.application }
                case kinds.Commit: {
                    const joiner = processed.joiner
                    const removed = processed.removed.map((m) => decodeLeafCredential(m.credential_bytes))
                    if (joiner && refusesExternalCommit(decodeLeafCredential(joiner.credential_bytes), removed)) {
                        throw new Error("An external commit removing a leaf of another account than its joiner's")
                    }
                    group.apply_commit(provider, processed)
                    const brought = processed.joiner
                    return {
                        kind: "commit",
                        leavesMet: processed.leaves_met.map((m) => mlsLeaf(m, false)),
                        joiner: brought ? mlsLeaf(brought, false) : null,
                    }
                }
                case kinds.Proposal:
                    return { kind: "proposal" }
                default:
                    throw new Error(`Unknown ProcessedKind: ${processed.kind}`)
            }
        } finally {
            processed.free()
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
        return this.requireGroup(conversationId).export_secret(this.requireProvider(), label, context, keyLength)
    }

    // ─── HPKE ────────────────────────────────────────────────────────

    async generateKeyPair(): Promise<HpkeKeyPair> {
        await this.initialize()
        const pair = this.requireBundle().hpke_generate_key_pair()
        try {
            return { publicKey: pair.public_key, privateKey: pair.private_key }
        } finally {
            pair.free()
        }
    }

    async seal(publicKey: Uint8Array, info: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Promise<HpkeSealed> {
        await this.initialize()
        const sealed = this.requireBundle().hpke_seal(publicKey, info, aad, plaintext)
        try {
            return { enc: sealed.enc, ciphertext: sealed.ciphertext }
        } finally {
            sealed.free()
        }
    }

    async open(privateKey: Uint8Array, sealed: HpkeSealed, info: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
        await this.initialize()
        return this.requireBundle().hpke_open(privateKey, sealed.enc, sealed.ciphertext, info, aad)
    }

    // ─── Internals ───────────────────────────────────────────────────

    private requireBundle(): MlsBundle {
        if (!this.bundle) throw new Error("MLS engine not initialized — call initialize() first")
        return this.bundle
    }

    private requireProvider(): BundleProvider {
        if (!this.provider) throw new Error("MLS engine not initialized — call initialize() first")
        return this.provider
    }

    private requireIdentity(): BundleIdentity {
        if (!this.identity) throw new Error("MLS engine has no identity — call setIdentity() first")
        return this.identity
    }

    private requireGroup(conversationId: ConversationId): BundleGroup {
        const group = this.groups.get(conversationId)
        if (!group) throw new Error(`No MLS group state for conversation ${conversationId}`)
        return group
    }
}

function commitOutput(out: BundleCommitOutput): CommitOutput {
    try {
        return { commit: out.commit, group_info: out.group_info }
    } finally {
        out.free()
    }
}

function mlsLeaf(member: BundleGroupMember, own: boolean): MlsLeaf {
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
