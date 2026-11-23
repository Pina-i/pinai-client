package io.github.pina_i.openmls

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import uniffi.openmls_native.ProcessedKind
import uniffi.openmls_native.Provider
import uniffi.openmls_native.groupCreateNew
import uniffi.openmls_native.groupJoin
import uniffi.openmls_native.groupJoinByExternalCommit
import uniffi.openmls_native.groupLoadFromProvider
import uniffi.openmls_native.hpkeGenerateKeyPair
import uniffi.openmls_native.hpkeOpen
import uniffi.openmls_native.hpkeSeal
import uniffi.openmls_native.identityBind
import uniffi.openmls_native.identityGenerateSignatureKey
import uniffi.openmls_native.keyPackageFromBytes

/** The MLS engine's native build as `@pinai/mls/bundle` declares one: the WASM facade's shape, synchronous. */
class OpenMlsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OpenMls")

    Constant("ProcessedKind") {
      mapOf("Application" to kindOf(ProcessedKind.APPLICATION), "Proposal" to kindOf(ProcessedKind.PROPOSAL), "Commit" to kindOf(ProcessedKind.COMMIT))
    }

    Class<ProviderObject>("Provider") {
      Constructor { -> ProviderObject(Provider()) }
      Function("serialize_storage") { provider: ProviderObject -> mls { provider.ref.serializeStorage() } }
      Function("deserialize_storage") { provider: ProviderObject, bytes: ByteArray -> mls { provider.ref.deserializeStorage(bytes) } }
    }

    Class<IdentityObject>("Identity") {
      StaticFunction("generate_signature_key") { provider: ProviderObject -> mls { identityGenerateSignatureKey(provider.ref) } }
      StaticFunction("bind") { provider: ProviderObject, credential: ByteArray, key: ByteArray ->
        IdentityObject(mls { identityBind(provider.ref, credential, key) })
      }
      Function("key_package") { identity: IdentityObject, provider: ProviderObject ->
        KeyPackageObject(mls { identity.ref.keyPackage(provider.ref) })
      }
      Function("signature_public_key") { identity: IdentityObject -> identity.ref.signaturePublicKey() }
      Function("free") { identity: IdentityObject -> identity.ref.close() }
    }

    Class<KeyPackageObject>("KeyPackage") {
      StaticFunction("from_bytes") { bytes: ByteArray -> KeyPackageObject(mls { keyPackageFromBytes(bytes) }) }
      Function("to_bytes") { kp: KeyPackageObject -> mls { kp.ref.toBytes() } }
      Function("credential_bytes") { kp: KeyPackageObject -> kp.ref.credentialBytes() }
      Function("signature_public_key") { kp: KeyPackageObject -> kp.ref.signaturePublicKey() }
      Function("free") { kp: KeyPackageObject -> kp.ref.close() }
    }

    Class<GroupObject>("Group") {
      StaticFunction("create_new") { provider: ProviderObject, founder: IdentityObject, groupId: ByteArray ->
        GroupObject(mls { groupCreateNew(provider.ref, founder.ref, groupId) })
      }
      StaticFunction("load_from_provider") { provider: ProviderObject, groupId: ByteArray ->
        mls { groupLoadFromProvider(provider.ref, groupId) }?.let(::GroupObject)
      }
      StaticFunction("join") { provider: ProviderObject, welcome: ByteArray, tree: ByteArray? ->
        GroupObject(mls { groupJoin(provider.ref, welcome, tree) })
      }
      StaticFunction("join_by_external_commit") { provider: ProviderObject, identity: IdentityObject, groupId: ByteArray, groupInfo: ByteArray ->
        ExternalJoinObject(mls { groupJoinByExternalCommit(provider.ref, identity.ref, groupId, groupInfo) })
      }
      Function("rejoin") { group: GroupObject, provider: ProviderObject, welcome: ByteArray ->
        mls { group.ref.rejoin(provider.ref, welcome) }?.let(::GroupObject)
      }
      Function("delete") { group: GroupObject, provider: ProviderObject -> mls { group.ref.delete(provider.ref) } }
      Function("export_ratchet_tree") { group: GroupObject -> mls { group.ref.exportRatchetTree() } }
      Function("list_members") { group: GroupObject -> mls { group.ref.listMembers() }.map(::GroupMemberObject) }
      Function("own_leaf_index") { group: GroupObject -> mls { group.ref.ownLeafIndex() }.toInt() }
      Function("epoch") { group: GroupObject -> mls { group.ref.epoch() }.toLong() }
      Function("add_member") { group: GroupObject, provider: ProviderObject, kp: KeyPackageObject ->
        AddOutputObject(mls { group.ref.addMember(provider.ref, kp.ref) })
      }
      Function("remove_member") { group: GroupObject, provider: ProviderObject, leafIndex: Int ->
        CommitOutputObject(mls { group.ref.removeMember(provider.ref, leafIndex.toUInt()) })
      }
      Function("update") { group: GroupObject, provider: ProviderObject -> CommitOutputObject(mls { group.ref.update(provider.ref) }) }
      Function("update_credential") { group: GroupObject, provider: ProviderObject, credential: ByteArray ->
        CommitOutputObject(mls { group.ref.updateCredential(provider.ref, credential) })
      }
      Function("merge_pending_commit") { group: GroupObject, provider: ProviderObject -> mls { group.ref.mergePendingCommit(provider.ref) } }
      Function("clear_pending_commit") { group: GroupObject, provider: ProviderObject -> mls { group.ref.clearPendingCommit(provider.ref) } }
      Function("encrypt_application") { group: GroupObject, provider: ProviderObject, plaintext: ByteArray ->
        mls { group.ref.encryptApplication(provider.ref, plaintext) }
      }
      Function("process_message") { group: GroupObject, provider: ProviderObject, message: ByteArray ->
        ProcessedMessageObject(mls { group.ref.processMessage(provider.ref, message) })
      }
      Function("apply_commit") { group: GroupObject, provider: ProviderObject, processed: ProcessedMessageObject ->
        mls { group.ref.applyCommit(provider.ref, processed.ref) }
      }
      Function("export_secret") { group: GroupObject, provider: ProviderObject, label: String, context: ByteArray, keyLength: Int ->
        mls { group.ref.exportSecret(provider.ref, label, context, keyLength.toUInt()) }
      }
      Function("free") { group: GroupObject -> group.ref.close() }
    }

    Class<ExternalJoinObject>("ExternalJoin") {
      Property("commit") { join: ExternalJoinObject -> mls { join.ref.commit() } }
      Property("group_info") { join: ExternalJoinObject -> mls { join.ref.groupInfo() } }
      Property("epoch") { join: ExternalJoinObject -> mls { join.ref.epoch() }.toLong() }
      Function("into_group") { join: ExternalJoinObject -> GroupObject(mls { join.ref.intoGroup() }) }
    }

    Class<ProcessedMessageObject>("ProcessedMessage") {
      Property("kind") { message: ProcessedMessageObject -> kindOf(mls { message.ref.kind() }) }
      Property("application") { message: ProcessedMessageObject -> mls { message.ref.application() } }
      Property("leaves_met") { message: ProcessedMessageObject -> mls { message.ref.leavesMet() }.map(::GroupMemberObject) }
      Property("joiner") { message: ProcessedMessageObject -> mls { message.ref.joiner() }?.let(::GroupMemberObject) }
      Property("removed") { message: ProcessedMessageObject -> mls { message.ref.removed() }.map(::GroupMemberObject) }
      Function("free") { message: ProcessedMessageObject -> message.ref.close() }
    }

    Class<GroupMemberObject>("GroupMember") {
      Property("leaf_index") { member: GroupMemberObject -> member.ref.leafIndex.toInt() }
      Property("credential_bytes") { member: GroupMemberObject -> member.ref.credentialBytes }
      Property("signature_public_key") { member: GroupMemberObject -> member.ref.signaturePublicKey }
    }

    Class<AddOutputObject>("AddOutput") {
      Property("commit") { out: AddOutputObject -> out.ref.commit }
      Property("welcome") { out: AddOutputObject -> out.ref.welcome }
      Property("group_info") { out: AddOutputObject -> out.ref.groupInfo }
      Function("free") { _: AddOutputObject -> Unit }
    }

    Class<CommitOutputObject>("CommitOutput") {
      Property("commit") { out: CommitOutputObject -> out.ref.commit }
      Property("group_info") { out: CommitOutputObject -> out.ref.groupInfo }
      Function("free") { _: CommitOutputObject -> Unit }
    }

    Class<HpkeKeyPairObject>("HpkeKeyPair") {
      Property("public_key") { pair: HpkeKeyPairObject -> pair.ref.publicKey }
      Property("private_key") { pair: HpkeKeyPairObject -> pair.ref.privateKey }
      Function("free") { _: HpkeKeyPairObject -> Unit }
    }

    Class<HpkeSealedObject>("HpkeSealed") {
      Property("enc") { sealed: HpkeSealedObject -> sealed.ref.enc }
      Property("ciphertext") { sealed: HpkeSealedObject -> sealed.ref.ciphertext }
      Function("free") { _: HpkeSealedObject -> Unit }
    }

    Function("hpke_generate_key_pair") { -> HpkeKeyPairObject(mls { hpkeGenerateKeyPair() }) }
    Function("hpke_seal") { publicKey: ByteArray, info: ByteArray, aad: ByteArray, plaintext: ByteArray ->
      HpkeSealedObject(mls { hpkeSeal(publicKey, info, aad, plaintext) })
    }
    Function("hpke_open") { privateKey: ByteArray, enc: ByteArray, ciphertext: ByteArray, info: ByteArray, aad: ByteArray ->
      mls { hpkeOpen(privateKey, enc, ciphertext, info, aad) }
    }
  }
}

/** The numbers `openmls-wasm`'s `ProcessedKind` gives its variants. */
private fun kindOf(kind: ProcessedKind): Int = when (kind) {
  ProcessedKind.APPLICATION -> 0
  ProcessedKind.PROPOSAL -> 1
  ProcessedKind.COMMIT -> 2
}
