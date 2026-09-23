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
  inside AES-GCM
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
