import ExpoModulesCore

/// The MLS engine's native build as `@pinai/mls/bundle` declares one: the WASM facade's shape, synchronous.
public class OpenMlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OpenMls")

    Constant("ProcessedKind") {
      ["Application": kindOf(.application), "Proposal": kindOf(.proposal), "Commit": kindOf(.commit)]
    }

    Class("Provider", ProviderObject.self) {
      Constructor { ProviderObject(Provider()) }
      Function("serialize_storage") { (provider: ProviderObject) in try mls { try provider.live().serializeStorage() } }
      Function("deserialize_storage") { (provider: ProviderObject, bytes: Data) in
        try mls { try provider.live().deserializeStorage(bytes: bytes) }
      }
    }

    Class("Identity", IdentityObject.self) {
      StaticFunction("generate_signature_key") { (provider: ProviderObject) in
        try mls { try identityGenerateSignatureKey(provider: provider.live()) }
      }
      StaticFunction("bind") { (provider: ProviderObject, credential: Data, key: Data) in
        try IdentityObject(mls { try identityBind(provider: provider.live(), credential: credential, signaturePublicKey: key) })
      }
      Function("key_package") { (identity: IdentityObject, provider: ProviderObject) in
        try KeyPackageObject(mls { try identity.live().keyPackage(provider: provider.live()) })
      }
      Function("signature_public_key") { (identity: IdentityObject) in try identity.live().signaturePublicKey() }
      Function("free") { (identity: IdentityObject) in identity.free() }
    }

    Class("KeyPackage", KeyPackageObject.self) {
      StaticFunction("from_bytes") { (bytes: Data) in try KeyPackageObject(mls { try keyPackageFromBytes(bytes: bytes) }) }
      Function("to_bytes") { (kp: KeyPackageObject) in try mls { try kp.live().toBytes() } }
      Function("credential_bytes") { (kp: KeyPackageObject) in try kp.live().credentialBytes() }
      Function("signature_public_key") { (kp: KeyPackageObject) in try kp.live().signaturePublicKey() }
      Function("free") { (kp: KeyPackageObject) in kp.free() }
    }

    Class("Group", GroupObject.self) {
      StaticFunction("create_new") { (provider: ProviderObject, founder: IdentityObject, groupId: Data) in
        try GroupObject(mls { try groupCreateNew(provider: provider.live(), founder: founder.live(), groupId: groupId) })
      }
      StaticFunction("load_from_provider") { (provider: ProviderObject, groupId: Data) -> GroupObject? in
        try mls { try groupLoadFromProvider(provider: provider.live(), groupId: groupId) }.map { GroupObject($0) }
      }
      StaticFunction("join") { (provider: ProviderObject, welcome: Data, tree: Data?) in
        try GroupObject(mls { try groupJoin(provider: provider.live(), welcome: welcome, ratchetTree: tree) })
      }
      StaticFunction("join_by_external_commit") { (provider: ProviderObject, identity: IdentityObject, groupId: Data, groupInfo: Data) in
        try mls {
          try ExternalJoinObject(
            reading: groupJoinByExternalCommit(provider: provider.live(), identity: identity.live(), groupId: groupId, groupInfo: groupInfo))
        }
      }
      Function("rejoin") { (group: GroupObject, provider: ProviderObject, welcome: Data) -> GroupObject? in
        try mls { try group.live().rejoin(provider: provider.live(), welcome: welcome) }.map { GroupObject($0) }
      }
      Function("delete") { (group: GroupObject, provider: ProviderObject) in try mls { try group.live().delete(provider: provider.live()) } }
      Function("export_ratchet_tree") { (group: GroupObject) in try mls { try group.live().exportRatchetTree() } }
      Function("list_members") { (group: GroupObject) in try mls { try group.live().listMembers() }.map { GroupMemberObject($0) } }
      Function("own_leaf_index") { (group: GroupObject) in try Int(mls { try group.live().ownLeafIndex() }) }
      Function("epoch") { (group: GroupObject) in try Int64(mls { try group.live().epoch() }) }
      Function("add_member") { (group: GroupObject, provider: ProviderObject, kp: KeyPackageObject) in
        try AddOutputObject(mls { try group.live().addMember(provider: provider.live(), keyPackage: kp.live()) })
      }
      Function("remove_member") { (group: GroupObject, provider: ProviderObject, leafIndex: Int) in
        try CommitOutputObject(mls { try group.live().removeMember(provider: provider.live(), leafIndex: UInt32(leafIndex)) })
      }
      Function("update") { (group: GroupObject, provider: ProviderObject) in
        try CommitOutputObject(mls { try group.live().update(provider: provider.live()) })
      }
      Function("update_credential") { (group: GroupObject, provider: ProviderObject, credential: Data) in
        try CommitOutputObject(mls { try group.live().updateCredential(provider: provider.live(), credential: credential) })
      }
      Function("merge_pending_commit") { (group: GroupObject, provider: ProviderObject) in
        try mls { try group.live().mergePendingCommit(provider: provider.live()) }
      }
      Function("clear_pending_commit") { (group: GroupObject, provider: ProviderObject) in
        try mls { try group.live().clearPendingCommit(provider: provider.live()) }
      }
      Function("encrypt_application") { (group: GroupObject, provider: ProviderObject, plaintext: Data) in
        try mls { try group.live().encryptApplication(provider: provider.live(), plaintext: plaintext) }
      }
      Function("process_message") { (group: GroupObject, provider: ProviderObject, message: Data) in
        try mls { try ProcessedMessageObject(reading: group.live().processMessage(provider: provider.live(), message: message)) }
      }
      Function("apply_commit") { (group: GroupObject, provider: ProviderObject, processed: ProcessedMessageObject) in
        try mls { try group.live().applyCommit(provider: provider.live(), processed: processed.live()) }
      }
      Function("export_secret") { (group: GroupObject, provider: ProviderObject, label: String, context: Data, keyLength: Int) in
        try mls { try group.live().exportSecret(provider: provider.live(), label: label, context: context, keyLength: UInt32(keyLength)) }
      }
      Function("free") { (group: GroupObject) in group.free() }
    }

    Class("ExternalJoin", ExternalJoinObject.self) {
      Property("commit") { (join: ExternalJoinObject) in join.commit }
      Property("group_info") { (join: ExternalJoinObject) in join.groupInfo }
      Property("epoch") { (join: ExternalJoinObject) in join.epoch }
      Function("into_group") { (join: ExternalJoinObject) in try GroupObject(mls { try join.live().intoGroup() }) }
    }

    Class("ProcessedMessage", ProcessedMessageObject.self) {
      Property("kind") { (message: ProcessedMessageObject) in kindOf(message.kind) }
      Property("application") { (message: ProcessedMessageObject) in message.application }
      Property("leaves_met") { (message: ProcessedMessageObject) in message.leavesMet.map { GroupMemberObject($0) } }
      Property("joiner") { (message: ProcessedMessageObject) -> GroupMemberObject? in message.joiner.map { GroupMemberObject($0) } }
      Property("removed") { (message: ProcessedMessageObject) in message.removed.map { GroupMemberObject($0) } }
      Function("free") { (message: ProcessedMessageObject) in message.free() }
    }

    Class("GroupMember", GroupMemberObject.self) {
      Property("leaf_index") { (member: GroupMemberObject) in Int(member.ref.leafIndex) }
      Property("credential_bytes") { (member: GroupMemberObject) in member.ref.credentialBytes }
      Property("signature_public_key") { (member: GroupMemberObject) in member.ref.signaturePublicKey }
    }

    Class("AddOutput", AddOutputObject.self) {
      Property("commit") { (out: AddOutputObject) in out.ref.commit }
      Property("welcome") { (out: AddOutputObject) in out.ref.welcome }
      Property("group_info") { (out: AddOutputObject) in out.ref.groupInfo }
      Function("free") { (_: AddOutputObject) in }
    }

    Class("CommitOutput", CommitOutputObject.self) {
      Property("commit") { (out: CommitOutputObject) in out.ref.commit }
      Property("group_info") { (out: CommitOutputObject) in out.ref.groupInfo }
      Function("free") { (_: CommitOutputObject) in }
    }

    Class("HpkeKeyPair", HpkeKeyPairObject.self) {
      Property("public_key") { (pair: HpkeKeyPairObject) in pair.ref.publicKey }
      Property("private_key") { (pair: HpkeKeyPairObject) in pair.ref.privateKey }
      Function("free") { (_: HpkeKeyPairObject) in }
    }

    Class("HpkeSealed", HpkeSealedObject.self) {
      Property("enc") { (sealed: HpkeSealedObject) in sealed.ref.enc }
      Property("ciphertext") { (sealed: HpkeSealedObject) in sealed.ref.ciphertext }
      Function("free") { (_: HpkeSealedObject) in }
    }

    Function("hpke_generate_key_pair") { try HpkeKeyPairObject(mls { try hpkeGenerateKeyPair() }) }
    Function("hpke_seal") { (publicKey: Data, info: Data, aad: Data, plaintext: Data) in
      try HpkeSealedObject(mls { try hpkeSeal(publicKey: publicKey, info: info, aad: aad, plaintext: plaintext) })
    }
    Function("hpke_open") { (privateKey: Data, enc: Data, ciphertext: Data, info: Data, aad: Data) in
      try mls { try hpkeOpen(privateKey: privateKey, enc: enc, ciphertext: ciphertext, info: info, aad: aad) }
    }

    // The 24 words take a good part of a second: off the JS thread, unlike the MLS calls.
    AsyncFunction("argon2id") { (password: Data, salt: Data, passes: Int, memoryKib: Int, lanes: Int, length: Int) in
      try mls {
        try argon2id(
          password: password, salt: salt, passes: UInt32(passes), memoryKib: UInt32(memoryKib), lanes: UInt32(lanes),
          length: UInt32(length))
      }
    }
  }
}

/// The numbers `openmls-wasm`'s `ProcessedKind` gives its variants.
private func kindOf(_ kind: ProcessedKind) -> Int {
  switch kind {
  case .application: return 0
  case .proposal: return 1
  case .commit: return 2
  }
}
