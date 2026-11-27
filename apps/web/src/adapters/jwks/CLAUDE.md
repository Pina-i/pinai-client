# adapters/jwks

`JwksCacheAdapter` — `@pinai/api`'s `JwksCache` (`e2ee/jwks-cache.adapter.ts`, the phone's too) over
this page's `localStorage`: an issuer's `/.well-known/jwks.json`, the keys leaf credentials and device
chains are checked against (`@pinai/crypto/attestation-chain.adapter`). The rules below are the shared
class's; only the storage is the web's.

- Kept in its storage for an hour; concurrent lookups share one fetch.
- `invalidate(issuer)` refetches for a rotated key, but keeps keys under a minute old: a forged
  leaf's signature must not make the client hammer an honest issuer.
- A fetch gives up after 10 s, and an issuer that failed fails at once for a minute: each leaf is
  checked inside its group's queue, which a hanging instance would otherwise stall.
