# adapters/jwks

`JwksCacheAdapter` — `IJwksCachePort` for the web: an issuer's `/.well-known/jwks.json`, the keys
leaf credentials and device chains are checked against (`@pinai/crypto/attestation-chain.adapter`).

- Kept in `localStorage` for an hour; concurrent lookups share one fetch.
- `invalidate(issuer)` refetches for a rotated key, but keeps keys under a minute old: a forged
  leaf's signature must not make the client hammer an honest issuer.
- A fetch gives up after 10 s, and an issuer that failed fails at once for a minute: each leaf is
  checked inside its group's queue, which a hanging instance would otherwise stall.
