package io.github.pina_i.devicekey

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEYSTORE = "AndroidKeyStore"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val TAG_BITS = 128

class DeviceKeyException(message: String, cause: Throwable?) : CodedException("ERR_DEVICE_KEY", message, cause)

/**
 * Sealing under a key that never leaves the Android Keystore, one per alias (the app names one per account).
 * In the TEE, not StrongBox: StrongBox is too slow for a snapshot of megabytes.
 */
class DeviceKeyModule : Module() {
  private val lock = Any()

  override fun definition() = ModuleDefinition {
    Name("DeviceKey")

    AsyncFunction("ready") { alias: String ->
      guarded("load") { keyFor(alias) }
      Unit
    }

    AsyncFunction("seal") { alias: String, plaintext: ByteArray ->
      guarded("seal") {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // The Keystore draws the nonce: it refuses one the caller gives for encryption.
        cipher.init(Cipher.ENCRYPT_MODE, keyFor(alias))
        mapOf("ciphertext" to cipher.doFinal(plaintext), "nonce" to cipher.iv)
      }
    }

    AsyncFunction("open") { alias: String, ciphertext: ByteArray, nonce: ByteArray ->
      guarded("open") {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, keyFor(alias), GCMParameterSpec(TAG_BITS, nonce))
        cipher.doFinal(ciphertext)
      }
    }

    AsyncFunction("wipe") { alias: String ->
      guarded("wipe") { synchronized(lock) { keyStore().deleteEntry(alias) } }
      Unit
    }
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  // Minted only when the Keystore says no entry has the alias: a key it fails to read is never replaced,
  // or everything sealed under it would be lost. One at a time, so two first calls mint one key.
  private fun keyFor(alias: String): SecretKey = synchronized(lock) {
    val store = keyStore()
    if (!store.containsAlias(alias)) return@synchronized mint(alias)
    store.getKey(alias, null) as? SecretKey ?: throw IllegalStateException("$alias is not a secret key")
  }

  private fun mint(alias: String): SecretKey {
    val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
      init(spec)
      generateKey()
    }
  }

  private inline fun <T> guarded(what: String, run: () -> T): T =
    try {
      run()
    } catch (e: Exception) {
      throw DeviceKeyException("device key: $what failed (${e.javaClass.simpleName})", e)
    }
}
