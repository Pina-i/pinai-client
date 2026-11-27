import CryptoKit
import ExpoModulesCore
import Foundation
import Security

/// The Keychain item's service: one item per alias under it.
private let SERVICE = "io.github.pina-i.device-key"
/// What Android's AES/GCM appends to the ciphertext, and what `open` takes back off it.
private let TAG_BYTES = 16

final class DeviceKeyException: Exception, @unchecked Sendable {
  private let what: String
  private let detail: String

  init(_ what: String, _ detail: String) {
    self.what = what
    self.detail = detail
    super.init()
  }

  override var code: String { "ERR_DEVICE_KEY" }
  override var reason: String { "device key: \(what) failed (\(detail))" }
}

private struct KeychainFailure: Error {
  let status: OSStatus
}

private struct NotAKey: Error {}

/**
 Sealing under a key kept in the Keychain, one per alias (the app names one per account): this device only, after its
 first unlock, never in a backup nor in iCloud Keychain. The Secure Enclave holds P-256 keys only, no AES one.
 The ciphertext carries its tag at its end and the nonce is 12 bytes, as on Android.
 */
public class DeviceKeyModule: Module {
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("DeviceKey")

    OnCreate {
      keepStoresOutOfBackups()
    }

    AsyncFunction("ready") { (alias: String) in
      try guarded("load") { _ = try self.key(for: alias) }
    }

    AsyncFunction("seal") { (alias: String, plaintext: Data) -> [String: Data] in
      try guarded("seal") {
        let box = try AES.GCM.seal(plaintext, using: self.key(for: alias))
        return ["ciphertext": box.ciphertext + box.tag, "nonce": Data(box.nonce)]
      }
    }

    AsyncFunction("open") { (alias: String, ciphertext: Data, nonce: Data) -> Data in
      try guarded("open") {
        guard ciphertext.count >= TAG_BYTES else { throw CryptoKitError.authenticationFailure }
        let box = try AES.GCM.SealedBox(
          nonce: AES.GCM.Nonce(data: nonce),
          ciphertext: ciphertext.prefix(ciphertext.count - TAG_BYTES),
          tag: ciphertext.suffix(TAG_BYTES))
        return try AES.GCM.open(box, using: self.key(for: alias))
      }
    }

    AsyncFunction("wipe") { (alias: String) in
      try guarded("wipe") {
        self.lock.lock()
        defer { self.lock.unlock() }
        let status = SecItemDelete(self.item(alias) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainFailure(status: status) }
      }
    }
  }

  private func item(_ alias: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: SERVICE, kSecAttrAccount as String: alias]
  }

  // Minted only when the Keychain says no item has the alias: a key it fails to read — a phone not unlocked since it
  // started, say — is never replaced, or everything sealed under it would be lost. One at a time, so two first calls
  // mint one key.
  private func key(for alias: String) throws -> SymmetricKey {
    lock.lock()
    defer { lock.unlock() }
    var read = item(alias)
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var found: CFTypeRef?
    let status = SecItemCopyMatching(read as CFDictionary, &found)
    switch status {
    case errSecSuccess:
      guard let bytes = found as? Data, bytes.count == 32 else { throw NotAKey() }
      return SymmetricKey(data: bytes)
    case errSecItemNotFound:
      return try mint(alias)
    default:
      throw KeychainFailure(status: status)
    }
  }

  private func mint(_ alias: String) throws -> SymmetricKey {
    let key = SymmetricKey(size: .bits256)
    var add = item(alias)
    add[kSecValueData as String] = key.withUnsafeBytes { Data($0) }
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    add[kSecAttrSynchronizable as String] = false
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainFailure(status: status) }
    return key
  }

  private func guarded<T>(_ what: String, _ run: () throws -> T) throws -> T {
    do {
      return try run()
    } catch let failure as KeychainFailure {
      throw DeviceKeyException(what, "Keychain \(failure.status)")
    } catch {
      throw DeviceKeyException(what, String(describing: type(of: error)))
    }
  }
}

// expo-sqlite keeps the app's databases in Documents/SQLite, which iOS backs up to iCloud: restored on another iPhone
// without their keys — in this one's Keychain only — they would be unreadable. A new iPhone is a new device to approve,
// as Android's `allowBackup: false` makes a new phone.
private func keepStoresOutOfBackups() {
  guard var directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
    .appendingPathComponent("SQLite", isDirectory: true)
  else { return }
  try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  var values = URLResourceValues()
  values.isExcludedFromBackup = true
  try? directory.setResourceValues(values)
}
