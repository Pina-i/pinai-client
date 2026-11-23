/**
 * What the engine needs of a build of the Rust crate (`crypto/`): its objects and functions, named
 * as the facades export them, every call synchronous. `openmls-wasm` is one as it is built
 * (`wasm.adapter.ts` checks it); a native build is one through a shim. A handle's `free` gives its
 * memory back now rather than when it is collected. Epochs come as `bigint` (WASM) or `number`
 * (native), absent values as `undefined` or `null`: the engine reads both.
 */

export interface BundleProvider {
    serialize_storage(): Uint8Array
    deserialize_storage(bytes: Uint8Array): void
}

export interface BundleIdentity {
    key_package(provider: BundleProvider): BundleKeyPackage
    signature_public_key(): Uint8Array
    free(): void
}

export interface BundleKeyPackage {
    to_bytes(): Uint8Array
    credential_bytes(): Uint8Array
    signature_public_key(): Uint8Array
    free(): void
}

export interface BundleGroupMember {
    readonly leaf_index: number
    readonly credential_bytes: Uint8Array
    readonly signature_public_key: Uint8Array
}

export interface BundleCommitOutput {
    readonly commit: Uint8Array
    readonly group_info: Uint8Array
    free(): void
}

export interface BundleAddOutput extends BundleCommitOutput {
    readonly welcome: Uint8Array
}

export interface BundleExternalJoin {
    readonly commit: Uint8Array
    readonly group_info: Uint8Array
    readonly epoch: bigint | number
    into_group(): BundleGroup
}

export interface BundleProcessedMessage {
    readonly kind: number
    readonly application: Uint8Array
    readonly leaves_met: BundleGroupMember[]
    readonly joiner: BundleGroupMember | null | undefined
    readonly removed: BundleGroupMember[]
    free(): void
}

export interface BundleGroup {
    rejoin(provider: BundleProvider, welcome: Uint8Array): BundleGroup | null | undefined
    delete(provider: BundleProvider): void
    export_ratchet_tree(): Uint8Array
    list_members(): BundleGroupMember[]
    own_leaf_index(): number
    epoch(): bigint | number
    add_member(provider: BundleProvider, keyPackage: BundleKeyPackage): BundleAddOutput
    remove_member(provider: BundleProvider, leafIndex: number): BundleCommitOutput
    update(provider: BundleProvider): BundleCommitOutput
    update_credential(provider: BundleProvider, credential: Uint8Array): BundleCommitOutput
    merge_pending_commit(provider: BundleProvider): void
    clear_pending_commit(provider: BundleProvider): void
    encrypt_application(provider: BundleProvider, plaintext: Uint8Array): Uint8Array
    process_message(provider: BundleProvider, message: Uint8Array): BundleProcessedMessage
    apply_commit(provider: BundleProvider, processed: BundleProcessedMessage): void
    export_secret(provider: BundleProvider, label: string, context: Uint8Array, keyLength: number): Uint8Array
    free(): void
}

export interface BundleHpkeKeyPair {
    readonly public_key: Uint8Array
    readonly private_key: Uint8Array
    free(): void
}

export interface BundleHpkeSealed {
    readonly enc: Uint8Array
    readonly ciphertext: Uint8Array
    free(): void
}

export interface MlsBundle {
    Provider: new () => BundleProvider
    Identity: {
        generate_signature_key(provider: BundleProvider): Uint8Array
        bind(provider: BundleProvider, credential: Uint8Array, signaturePublicKey: Uint8Array): BundleIdentity
    }
    KeyPackage: {
        from_bytes(bytes: Uint8Array): BundleKeyPackage
    }
    Group: {
        create_new(provider: BundleProvider, founder: BundleIdentity, groupId: Uint8Array): BundleGroup
        load_from_provider(provider: BundleProvider, groupId: Uint8Array): BundleGroup | null | undefined
        join(provider: BundleProvider, welcome: Uint8Array, ratchetTree: Uint8Array | null): BundleGroup
        join_by_external_commit(
            provider: BundleProvider,
            identity: BundleIdentity,
            groupId: Uint8Array,
            groupInfo: Uint8Array,
        ): BundleExternalJoin
    }
    ProcessedKind: { readonly Application: number; readonly Proposal: number; readonly Commit: number }
    hpke_generate_key_pair(): BundleHpkeKeyPair
    hpke_seal(publicKey: Uint8Array, info: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): BundleHpkeSealed
    hpke_open(privateKey: Uint8Array, enc: Uint8Array, ciphertext: Uint8Array, info: Uint8Array, aad: Uint8Array): Uint8Array
}
