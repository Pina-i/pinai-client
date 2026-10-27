# adapters/storage

The web's durable device storage: IndexedDB for the bytes, `localStorage` for
which account they belong to.

## Per-account storage

Everything the device keeps for an account lives in databases named after its
actor URI, so two accounts signing in on one browser each keep their own
device instead of one erasing the other:

- `pinai-e2ee:<actor URI>` — the E2EE store behind `SealedStorage`, including
  the non-extractable device `CryptoKey` in `meta`
- `pinai-zustand-store:<actor URI>` — the persisted message-plaintext cache,
  sealed under that same account's device key

One account's databases are open per page load, chosen at boot from the
`e2ee_account` key in `localStorage`. Before the first sign-in no account is
open: the E2EE store rejects every call and the message cache is inert.

## Files

- `idb-key-value-store.adapter.ts` — `IdbKeyValueStore`, the `IKeyValueStore`
  over one database, plus the device-key slot only IndexedDB can hold
- `encrypted-idb-storage.adapter.ts` — the zustand `PersistStorage`, msgpack
  inside AES-GCM. A read loads the device key first (`IDeviceKeyPort.ready`):
  - the key or IndexedDB failing is a failed read: thrown, nothing touched,
    tried again at the next page load;
  - a row that can't be decoded with the key loaded (corrupt, sealed under
    another key, an older format) is moved to `<name>:unreadable:<ISO time>`
    — never deleted, never overwritten — and the app starts empty. A move
    that fails is a failed read.
- `store.ts` wraps it in `guardPersistStorage` (`store/persist-guard.ts`): no
  write until hydration applied a successful read, none for the page load
  after a failed one, none when no persisted field changed, one at a time —
  `persist` would otherwise save its empty defaults over a cache not yet read
  back
- The device key (`adapters/e2ee/device-key.adapter.ts`) is loaded one call at
  a time — two first uses racing would mint two keys, the second overwriting
  the first —, only an absent key is minted, never one that failed to read,
  and it is kept once loaded (until `wipe`): a later read of its slot failing
  can't be taken for a row it can't open
- `account-storage-browser.adapter.ts` — `IAccountStoragePort`. `switchTo`
  records the account and reloads, which is also what clears the previous
  account's in-memory state; the route guard (`routes/-require-session.ts`)
  calls it before the authenticated layout mounts

## Migration from the shared store

Earlier builds kept one `pinai-e2ee` and one `pinai-zustand-store` for every
account. The first switch copies both to the account bound in
`pinai-e2ee`'s `meta` (the device key goes with them, so the rows still open)
and deletes them. An unbound store holds nothing reusable and is only
deleted; an account's existing namespaced store always wins over the copy.
