# crypto — the MLS engine

Pīna'i's MLS engine in Rust, around [openmls](https://github.com/openmls/openmls): the minimum surface the clients
use — KeyPackages, groups, Welcomes and external joins, commits, application messages, exported secrets — and HPKE.
One Cargo workspace, one `Cargo.lock`, one `target/`:

| Crate | What it is |
|---|---|
| `openmls-core/` | The engine in plain Rust, a module per notion. Every failure is an `MlsError`: `Malformed` (bytes from elsewhere that aren't what they claim), `Refused` (openmls said no), `State` (this device's state forbids it). Bytes from the network are parsed into its types at the entry (`IncomingWelcome`, `IncomingGroupInfo`, `IncomingMessage`, `RatchetTree`, `KeyPackage::parse`). Its tests are the engine's. |
| `openmls-wasm/` | Its wasm-bindgen facade: the same objects for the web client, bytes as `Uint8Array`, an `MlsError` thrown as an `Error`. wasm-pack builds it into `openmls-pkg/`, the npm package `@pinai/mls` loads. |

A facade holds no rule: what the engine does, every platform must do alike, so it goes in the core.

## Pinned ciphersuite

`MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519` — the RFC 9420
mandatory-to-implement suite. Single-suite to keep the WASM bundle
small and to avoid a runtime negotiation step.

## The leaf's key before its credential

`Identity::generate_signature_key` makes a leaf signature keypair (kept in the
provider's storage) and answers its public key; `Identity::bind` then binds a
credential to it. The split is what lets the device's root key sign the leaf key
into the credential first (`leaf_binding`, `identity-provider/specs/e2ee.md § 3.4`).
A claimed `KeyPackage` shows `credential_bytes` and `signature_public_key`, which the
client checks before adding it; a commit's `ProcessedMessage::leaves_met` lists the
leaves it brought in or replaced (this device's own left out), checked as they are
met. `Group::update_credential` commits a new credential into the device's own leaf
over the key it carries.

## Commits, GroupInfos and proposals

Each commit a `Group` makes — `add_member`, `remove_member`, `update`,
`update_credential` — stays pending until the DS takes it (`merge_pending_commit`,
`clear_pending_commit`), and comes with `group_info`: the GroupInfo of the epoch it
opens, as an `MlsMessage`, the ratchet tree and `external_pub` in it — what the client
posts beside the commit, and all a device needs to join alone
(`identity-provider/specs/e2ee.md § 5`). `Group::join_by_external_commit` joins from
one: an external commit adding the bound `Identity`'s leaf, its group already merged by
openmls — kept once the DS took the commit, `delete`d once refused; rows a join left
under that group id are deleted first, by it and by `Group::join`.

## Leaf lifetimes

`Identity::key_package` builds KeyPackages that live a year (`KEY_PACKAGE_LIFETIME_SECONDS`),
not openmls's default 12 weeks. openmls checks an added KeyPackage's lifetime when a member
applies the add, with no way to skip it: with 12 weeks, a member away a few weeks — 12 weeks
less the package's age when it was claimed, up to the instance's 30 days — could no longer apply
an add made meanwhile, and would stop reading the group. openmls's `has_acceptable_range`
(12 weeks) is never called, here nor in openmls. The instance still drops unclaimed packages
after 30 days.

No join — `Group::join`, `rejoin`, `join_by_external_commit` — checks the lifetime of the
tree's leaves (`skip_lifetime_validation`). Only a leaf never updated has one, the
KeyPackage's it came in by, and nothing refreshes leaves on a schedule: past it, a member who
never committed would keep every new device out of the group. A KeyPackage is still checked
when it is added.

`process_message` drops every proposal (`ProcessedKind::Proposal`), a join proposal
among them, and a commit never takes in the group's proposal store: a proposal kept
would ride a member's next commit (§ 6.3).

A commit received is staged, not merged: `process_message` shows its `joiner` — the leaf an
external commit (a `new_member_commit` sender) brings in, at the index it takes — and the
leaves it `removed`, as they stand before it, and `Group::apply_commit` merges it, filling
`leaves_met`. A `ProcessedMessage` dropped unapplied leaves the group as it was. RFC 9420
§ 12.4.3.2 leaves an external commit's removals for the application to accept: the client
refuses one reaching a leaf of another account than its joiner's (`@pinai/mls`), which needs
the credentials the engine doesn't read.

## HPKE (`openmls-core/src/hpke.rs`)

RFC 9180 base mode with the suite key shares use — DHKEM(X25519, HKDF-SHA256),
HKDF-SHA256, AES-128-GCM (`identity-provider/specs/e2ee.md § 3.11`) —, from
`openmls_rust_crypto`'s own implementation: `hpke_generate_key_pair`,
`hpke_derive_key_pair`, `hpke_seal` (a low-order key refused), `hpke_open`. Its
`cargo test` checks RFC 9180 A.1.1's vectors; failures are `MlsError`s, tested natively.

## Building

```bash
# One-time toolchain setup (skip if already done):
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# The engine's tests, native, from crypto/:
cargo test --workspace

# The browser bundle, from crypto/openmls-wasm/:
./build.sh
```

You rarely need the last step by hand: `apps/web`'s `dev`, `build`, `test`
and `typecheck` scripts run `scripts/build-wasm.mjs` first, which rebuilds
only when a crate's sources, a manifest or the lock are newer than the output.

The produced `../openmls-pkg/` is a self-contained npm package —
`package.json`, `.wasm`, `.d.ts`, JS glue. `@pinai/mls` and `apps/web`
depend on it with pnpm's `link:` protocol, never `file:` — the root
`README.md` explains why a `file:` dependency leaves the app on stale code.

## Build flags

`openmls-wasm` exposes one feature, `console_error_panic_hook`,
on by default. It surfaces Rust panics through `console.error` instead
of the silent `unreachable executed` browser failure mode. Cheap; we
keep it on for now.

## Updating openmls

The workspace's `Cargo.toml` pins exact versions (`=0.8.1` etc.). `openmls` is on a 0.x
release line and minor bumps may break the wrapper. Treat upgrades as
deliberate work: bump, run `cargo test`, run `wasm-pack build`, hand-test
in the web client. See the implementation plan's "Risks / decisions
still open" section.

## What's not here yet

- **Persistence.** `OpenMlsRustCrypto` is in-memory; the provider state
  leaves as a snapshot, which `@pinai/crypto`'s `SealedStorage` keeps
  encrypted at rest.
- **`wasm-bindgen-test` browser tests.** The core's failures are tested natively; the facade's mapping to `Error` rides with the JS adapter tests.
- **Identity-key (MSK / SSK / USK) generation.** That's a thin layer
  over `@noble/curves` Ed25519 in the JS adapter — not the MLS engine.
