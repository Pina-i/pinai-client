import type { ActorUri, ConversationId, DeviceId } from "../models/e2ee"
import type { LeafClaim, LeafCredential, MlsLeaf } from "../models/leaf-trust"

export type MlsCiphertext = Uint8Array

/** A commit this device made, and the GroupInfo of the epoch it opens: both POSTed to `/api/mls/groups/:id/commits`. */
export interface CommitOutput {
    /** TLS-encoded MLS Commit. */
    commit: Uint8Array
    /**
     * TLS-encoded MLS GroupInfo, with the ratchet tree and the `external_pub` key: all a device needs
     * to join on its own ({@link IMlsEngine.joinByExternalCommit}).
     */
    group_info: Uint8Array
}

export interface AddMemberOutput extends CommitOutput {
    /**
     * TLS-encoded MLS Welcome — deliver to the new member's IdP
     * (local: REST insert; cross-IdP: AP `Create{Note}` with
     * `mlsKind: welcome`).
     */
    welcome: Uint8Array
    /** Ratchet tree the joiner needs alongside the Welcome. */
    ratchet_tree: Uint8Array
}

/** A join by external commit, pending until the DS takes the commit. */
export interface ExternalJoinOutput extends CommitOutput {
    /** The epoch the commit opens, which it is posted at. */
    epoch: bigint
}

/**
 * Categorises the result of {@link IMlsEngine.processMessage} so the
 * caller can route without poking at MLS internals.
 */
export type ProcessOutcome =
    | { kind: "application"; plaintext: Uint8Array }
    /** `leavesMet`: the leaves it brought in or replaced, this device's own left out. */
    | { kind: "commit"; leavesMet: MlsLeaf[] }
    /** A proposal, ignored: never kept, so no commit of this device's carries it. */
    | { kind: "proposal" }

/**
 * The MLS engine, as the rest of the client sees it.
 *
 * Today the only implementation wraps the `openmls` WASM bundle, whose calls
 * are synchronous once the module is instantiated. The port is nonetheless
 * asynchronous throughout, for two reasons:
 *
 * 1. Hermes has no WebAssembly, so React Native will drive the same Rust
 *    crate through a native binding (uniffi + JSI). Whether that binding can
 *    be synchronous is a property of the binding technology, decided later —
 *    and retrofitting `sync → async` through `e2ee.adapter.ts` afterwards
 *    would be a rework of the whole message path.
 * 2. MLS work on the JS thread blocks the UI on both platforms. An
 *    asynchronous surface leaves room to move it off-thread without another
 *    signature change.
 *
 * Bytes in, bytes out: everything crossing this interface is wire-format, so
 * a native implementation has to agree with the WASM one byte-for-byte. The
 * conformance specs in `test/` are the contract.
 */
export interface IMlsEngine {
    /** Load the engine. Idempotent and race-safe. */
    initialize(): Promise<void>

    /**
     * Drop the in-memory provider, identity and group caches — used when a
     * different user logs in on the same device.
     */
    resetProvider(): Promise<void>

    /**
     * A fresh leaf signature key, kept in the engine's storage: its public key, for the device's
     * root key to bind before {@link IMlsEngine.setIdentity}.
     */
    generateSignatureKey(): Promise<Uint8Array>

    /**
     * What this device's KeyPackages and the groups it founds carry: `credential` over
     * `signatureKey`, a key in the engine's storage already.
     */
    setIdentity(credential: LeafCredential, signatureKey: Uint8Array): Promise<void>

    /** The signature key of this device's own leaf in a group it holds, or null when it holds none. */
    ownLeafSignatureKey(): Promise<Uint8Array | null>

    getDeviceSignaturePublicKey(): Promise<Uint8Array>

    createKeyPackage(): Promise<Uint8Array>

    /** A claimed KeyPackage's leaf, to check before adding it. Rejects one that doesn't validate. */
    inspectKeyPackage(keyPackageBytes: Uint8Array): Promise<LeafClaim>

    createGroup(conversationId: ConversationId): Promise<void>

    joinGroup(
        conversationId: ConversationId,
        welcomeBytes: Uint8Array,
        ratchetTreeBytes?: Uint8Array | null,
    ): Promise<void>

    /**
     * Join again from a Welcome for a group this device holds — it was committed out and added
     * back. The group is replaced only when the Welcome brings a later epoch; `false` keeps it, as
     * for a Welcome from a group both sides founded at once.
     */
    rejoinGroup(conversationId: ConversationId, welcomeBytes: Uint8Array): Promise<boolean>

    /**
     * Join a group this device doesn't hold from its GroupInfo, by an external commit adding its
     * leaf: the credential bound with {@link IMlsEngine.setIdentity}, as its KeyPackages carry.
     * Refused for a GroupInfo of another group. The group stays pending, out of
     * {@link IMlsEngine.hasGroup}: {@link IMlsEngine.mergePendingCommit} keeps it once the DS took
     * the commit, {@link IMlsEngine.clearPendingCommit} drops it.
     */
    joinByExternalCommit(conversationId: ConversationId, groupInfo: Uint8Array): Promise<ExternalJoinOutput>

    /** Drop a group's state from this device. */
    deleteGroup(conversationId: ConversationId): Promise<void>

    hasGroup(conversationId: ConversationId): Promise<boolean>

    knownGroupIds(): Promise<ConversationId[]>

    /** Snapshot of the provider's KV state, for at-rest persistence. */
    serializeStorage(): Promise<Uint8Array>

    restoreStorage(snapshot: Uint8Array, knownGroupIds: ConversationId[]): Promise<void>

    getEpoch(conversationId: ConversationId): Promise<bigint>

    addMember(
        conversationId: ConversationId,
        peerKeyPackageBytes: Uint8Array,
    ): Promise<AddMemberOutput>

    removeMember(conversationId: ConversationId, memberIndex: number): Promise<CommitOutput>

    findLeafByDeviceId(
        conversationId: ConversationId,
        actorUri: ActorUri,
        deviceId: DeviceId,
    ): Promise<number | null>

    /** Every leaf of the group, credential or not. */
    groupLeaves(conversationId: ConversationId): Promise<MlsLeaf[]>

    /**
     * Drop the commit built and not merged — one the DS refused or never acknowledged: the group
     * builds no other commit while one is pending. A pending join goes with its group.
     */
    clearPendingCommit(conversationId: ConversationId): Promise<void>

    update(conversationId: ConversationId): Promise<CommitOutput>

    /** A commit putting `credential` in this device's own leaf, over the signature key it carries. */
    updateOwnCredential(conversationId: ConversationId, credential: LeafCredential): Promise<CommitOutput>

    /** Once the DS took the commit; a pending join's group is then held. */
    mergePendingCommit(conversationId: ConversationId): Promise<void>

    encryptApplication(
        conversationId: ConversationId,
        plaintext: Uint8Array,
    ): Promise<MlsCiphertext>

    processMessage(
        conversationId: ConversationId,
        msgBytes: Uint8Array,
    ): Promise<ProcessOutcome>

    exportSecret(
        conversationId: ConversationId,
        label: string,
        context: Uint8Array,
        keyLength: number,
    ): Promise<Uint8Array>
}
