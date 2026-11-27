import ExpoModulesCore

// SharedRef, not SharedObject: Expo requires a Constructor of a SharedObject class, and JavaScript makes none of these.

/// A uniffi object JavaScript holds: its Rust memory goes at `free` — the reference dropped, uniffi frees it — or with it.
class NativeObject<T: AnyObject>: SharedRef<T?> {
  /// The object, unless JavaScript freed it already.
  func live() throws -> T {
    guard let object = ref else { throw FreedException() }
    return object
  }

  func free() {
    ref = nil
  }
}

final class ProviderObject: NativeObject<Provider> {}
final class IdentityObject: NativeObject<Identity> {}
final class KeyPackageObject: NativeObject<KeyPackage> {}
final class GroupObject: NativeObject<Group> {}

// Expo's Swift property getters can't throw, Kotlin's can: what JavaScript reads as properties is read as the object is
// made, where an error still reaches it. The core fails these reads only on a poisoned lock, or a join's group taken.

final class ExternalJoinObject: NativeObject<ExternalJoin> {
  let commit: Data
  let groupInfo: Data
  let epoch: Int64

  init(reading join: ExternalJoin) throws {
    commit = try join.commit()
    groupInfo = try join.groupInfo()
    epoch = Int64(try join.epoch())
    super.init(join)
  }
}

final class ProcessedMessageObject: NativeObject<ProcessedMessage> {
  let kind: ProcessedKind
  let application: Data
  let leavesMet: [GroupMember]
  let joiner: GroupMember?
  let removed: [GroupMember]

  init(reading message: ProcessedMessage) throws {
    kind = try message.kind()
    application = try message.application()
    leavesMet = try message.leavesMet()
    joiner = try message.joiner()
    removed = try message.removed()
    super.init(message)
  }
}

/// A uniffi record, read from JavaScript through getters as the WASM's are.
final class AddOutputObject: SharedRef<AddOutput> {}
final class CommitOutputObject: SharedRef<CommitOutput> {}
final class GroupMemberObject: SharedRef<GroupMember> {}
final class HpkeKeyPairObject: SharedRef<HpkeKeyPair> {}
final class HpkeSealedObject: SharedRef<HpkeSealed> {}

/// A core error, thrown to JavaScript with its kind as the code.
final class MlsException: Exception, @unchecked Sendable {
  private let failure: MlsFailure

  init(_ failure: MlsFailure) {
    self.failure = failure
    super.init()
  }

  override var code: String {
    switch failure {
    case .Malformed: return "ERR_MLS_MALFORMED"
    case .Refused: return "ERR_MLS_REFUSED"
    case .State: return "ERR_MLS_STATE"
    }
  }

  override var reason: String {
    switch failure {
    case .Malformed(let message), .Refused(let message), .State(let message): return message
    }
  }
}

/// What Kotlin's uniffi throws on an object used after `close`.
final class FreedException: Exception, @unchecked Sendable {
  override var reason: String { "This object was freed" }
}

func mls<T>(_ call: () throws -> T) throws -> T {
  do {
    return try call()
  } catch let failure as MlsFailure {
    throw MlsException(failure)
  }
}
