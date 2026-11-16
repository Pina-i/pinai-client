# adapters/e2ee

The browser's own crypto, behind ports `@pinai/crypto` can't fill portably.

- **`device-key.adapter.ts`** — `WebCryptoDeviceKeyAdapter` (`IDeviceKeyPort`): the device's
  at-rest AES-256-GCM key, non-extractable, kept as a `CryptoKey` in IndexedDB. Seals the E2EE
  store and the persisted message cache.
- **`attachment-crypto.adapter.ts`** — `WebCryptoAttachmentCryptoAdapter`
  (`IAttachmentCryptoPort`): attachment sealing on `crypto.subtle`, byte for byte the
  portable `NobleAttachmentCryptoAdapter` of `@pinai/crypto` (fresh 32-byte key, 12-byte nonce,
  the attachment's UUID as AAD, `ciphertext || tag`). The web uses it because noble runs on the
  main thread at ~28 ms/MB, WebCrypto off it at ~1 ms/MB. `test/attachment-crypto.spec.ts`
  checks both open each other's bytes.
- Both work in the desktop app: its `app://` scheme is registered secure, so `crypto.subtle`
  exists there.
