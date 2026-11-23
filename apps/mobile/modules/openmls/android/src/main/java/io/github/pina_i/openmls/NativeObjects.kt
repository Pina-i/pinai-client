package io.github.pina_i.openmls

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.sharedobjects.SharedRef
import uniffi.openmls_native.AddOutput
import uniffi.openmls_native.CommitOutput
import uniffi.openmls_native.ExternalJoin
import uniffi.openmls_native.Group
import uniffi.openmls_native.GroupMember
import uniffi.openmls_native.HpkeKeyPair
import uniffi.openmls_native.HpkeSealed
import uniffi.openmls_native.Identity
import uniffi.openmls_native.KeyPackage
import uniffi.openmls_native.MlsFailure
import uniffi.openmls_native.ProcessedMessage
import uniffi.openmls_native.Provider

// SharedRef, not SharedObject: Expo requires a Constructor of a SharedObject class, and JavaScript makes none of these.

/** A uniffi object JavaScript holds: its Rust memory goes with it, or at `free`. */
open class NativeObject<T : AutoCloseable>(inner: T) : SharedRef<T>(inner) {
  override fun sharedObjectDidRelease() {
    ref.close()
  }
}

class ProviderObject(inner: Provider) : NativeObject<Provider>(inner)
class IdentityObject(inner: Identity) : NativeObject<Identity>(inner)
class KeyPackageObject(inner: KeyPackage) : NativeObject<KeyPackage>(inner)
class GroupObject(inner: Group) : NativeObject<Group>(inner)
class ExternalJoinObject(inner: ExternalJoin) : NativeObject<ExternalJoin>(inner)
class ProcessedMessageObject(inner: ProcessedMessage) : NativeObject<ProcessedMessage>(inner)

/** A uniffi record, read from JavaScript through getters as the WASM's are. */
class AddOutputObject(value: AddOutput) : SharedRef<AddOutput>(value)
class CommitOutputObject(value: CommitOutput) : SharedRef<CommitOutput>(value)
class GroupMemberObject(value: GroupMember) : SharedRef<GroupMember>(value)
class HpkeKeyPairObject(value: HpkeKeyPair) : SharedRef<HpkeKeyPair>(value)
class HpkeSealedObject(value: HpkeSealed) : SharedRef<HpkeSealed>(value)

/** A core error, thrown to JavaScript with its kind as the code. */
class MlsException(failure: MlsFailure) : CodedException(
  when (failure) {
    is MlsFailure.Malformed -> "ERR_MLS_MALFORMED"
    is MlsFailure.Refused -> "ERR_MLS_REFUSED"
    is MlsFailure.State -> "ERR_MLS_STATE"
  },
  failure.message,
  failure,
)

inline fun <T> mls(call: () -> T): T =
  try {
    call()
  } catch (failure: MlsFailure) {
    throw MlsException(failure)
  }
