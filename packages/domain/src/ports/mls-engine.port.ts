import type { ActorUri, ConversationId, DeviceId } from "../models/e2ee"
import type { GroupLeaf } from "../models/group"

export type MlsCiphertext = Uint8Array

export interface AddMemberOutput {
    /** TLS-encoded MLS Commit — POST to `/api/mls/groups/:id/commits`. */
    commit: Uint8Array
    /**
     * TLS-encoded MLS Welcome — deliver to the new member's IdP
     * (local: REST insert; cross-IdP: AP `Create{Note}` with
     * `mlsKind: welcome`).
     */
    welcome: Uint8Array
    /** Ratchet tree the joiner needs alongside the Welcome. */
    ratchet_tree: Uint8Array
}

/**
 * Categorises the result of {@link IMlsEngine.processMessage} so the
 * caller can route without poking at MLS internals.
 */
export type ProcessOutcome =
    | { kind: "application"; plaintext: Uint8Array }
    | { kind: "commit" }
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

    setIdentity(
        actorUri: ActorUri,
        deviceId: DeviceId,
        existingSignaturePublicKey?: Uint8Array,
    ): Promise<void>

    findOwnLeafSigKey(actorUri: ActorUri, deviceId: DeviceId): Promise<Uint8Array | null>

    getDeviceSignaturePublicKey(): Promise<Uint8Array>

    createKeyPackage(): Promise<Uint8Array>

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

    removeMember(conversationId: ConversationId, memberIndex: number): Promise<Uint8Array>

    findLeafByDeviceId(
        conversationId: ConversationId,
        actorUri: ActorUri,
        deviceId: DeviceId,
    ): Promise<number | null>

    /** Every leaf of the group whose credential names an actor and a device. */
    groupMembers(conversationId: ConversationId): Promise<GroupLeaf[]>

    /**
     * Drop the commit built and not merged — one the DS refused or never acknowledged: the group
     * builds no other commit while one is pending.
     */
    clearPendingCommit(conversationId: ConversationId): Promise<void>

    update(conversationId: ConversationId): Promise<Uint8Array>

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
