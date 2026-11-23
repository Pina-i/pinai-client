# @pinai/mls

The MLS engine, over any build of the Rust crate (`crypto/`).

The contract callers depend on is not here — `IMlsEngine` lives in `@pinai/domain/ports`. This package supplies the
engine that satisfies it (`engine.ts`), once for every platform, over a bundle (`bundle.ts`): the WASM build, loaded
by `wasm.adapter.ts`, or the mobile app's native build (`apps/mobile/modules/openmls`, handed over through
`apps/mobile/src/adapters/mls/native-engine.ts`). `contract/` is what every build must
do.

## Files

- **`leaf-credential.ts`** — shared by every implementation, and the reason
  this is a package rather than a file in the web app. The credential bytes
  travel: they sit in the BasicCredential of our leaf in the ratchet tree, and
  peers decode them to learn which device owns which leaf — which is how
  device revocation finds the leaf to remove — and to check it
  (`identity-provider/specs/e2ee.md § 3.4`). Two implementations that
  disagreed here would build groups whose members cannot identify each other.
  `apps/web/test/leaf-credential.spec.ts` pins the exact encoding.
  - v2 only: `{ v: 2, actor_uri, device_id, drk_pub, idp_att: { issuer, kid,
    expires_at, signature }, leaf_binding, approvals }`, written in that order whatever
    order the object holds. Anything else decodes to `null` — a leaf without a
    credential, never trusted. The type is the domain's (`models/leaf-trust.ts`).
  - `approvals` — how the device was approved: `{ by: "passphrase", generation,
    approval_public_key, signature }` and `{ by: "device", device_id, signature }`, each
    kind's fields in that order. None is written as no key at all, and read so. An
    approval that doesn't read — another kind, a field missing or mistyped — is left
    out, the credential kept: it proves nothing, and is no reason to refuse a leaf.
- **`bundle.ts`** — `MlsBundle`: what the engine needs of a build — the facades' objects and functions, named as they
  export them (`Group.create_new`, `add_member`…), every call synchronous. `openmls-wasm` is one as built; a native
  build is one through its app's shim.
- **`engine.ts`** — `MlsEngine`, the `IMlsEngine` and the build's HPKE (`IHpkePort`, one load for both). Owns one
  provider + one identity + a `Map<conversation_id, group>`, over the bundle its loader gives (`initialize(input)`
  hands `input` to it, once; the bundle stays across `resetProvider`). Every method is `async` to satisfy the port;
  the bundle's calls are synchronous, so no two operations interleave on a group.
  A group signs with the keypair of its own leaf, read from the provider's
  storage, not with the bound `Identity`: a device that reloads before it
  joins anything binds a new key, while the KeyPackages it published carry
  the old one. The `Identity` only makes KeyPackages and founds groups.
  `clearPendingCommit` drops a commit the DS never took — openmls builds no
  other commit while one is pending.
  `rejoinGroup` takes a Welcome to a group already held only when it brings a
  later epoch, deleting the old state first so none of it lingers under the
  same group id; `deleteGroup` drops a group from the provider.
  - The leaf key comes before its credential: `generateSignatureKey`, then
    `setIdentity(credential, key)` once the root key signed the key into it;
    `ownLeafSignatureKey` is a held group's own leaf key, reused across reloads.
  - What the checks need: `inspectKeyPackage` (a claimed KeyPackage's
    credential and signature key), `groupLeaves` (every leaf, `own` marked),
    a commit's `leavesMet`; `updateOwnCredential` commits a new credential into
    the device's own leaf over the key it carries.
  - Every commit answers its GroupInfo (`CommitOutput.group_info`), posted with
    it. `joinByExternalCommit` joins from a GroupInfo with the bound identity's
    leaf and answers the tree it makes (`leaves`, the new leaf `own`); the group
    waits apart, out of `hasGroup`, until `mergePendingCommit` holds it or
    `clearPendingCommit` deletes it from the provider. A proposal comes out as
    `{ kind: "proposal" }`: the wrapper keeps none.
  - A commit received is staged by the wrapper, then applied (`apply_commit`): an external
    one — its `joiner`, a `new_member_commit` — whose removals reach a leaf of another account
    than its joiner's (`refusesExternalCommit`, the domain's, over the decoded credentials) is
    thrown unapplied, as an invalid commit; RFC 9420 § 12.4.3.2 leaves that check to the
    application. An applied one answers its `joiner`, at the index it took.
  - No join — by Welcome, again by Welcome, by external commit — checks the
    tree's leaf lifetimes (`crypto/README.md`); a KeyPackage added
    still is, by every member applying the add: KeyPackages live a year.
    `joinGroup` deletes first what a join never kept left in the provider under
    that group id (a reload while it was pending).
- **`wasm.adapter.ts`** — `MlsAdapter`, the engine over `openmls-wasm`: the web's and the desktop's. The only place
  `openmls-wasm` is imported; `const bundle: MlsBundle = wasm` fails to compile when the facade drifts.
- **`contract/`** — the engine's contract, plain TypeScript (no test runner, nothing Node- or browser-only: it runs on
  Hermes): `scenarios.ts`, one scenario per behaviour a build must carry, played on WASM by
  `apps/web/test/mls-contract.spec.ts` and on the native build by the mobile app's control screen;
  `wasm-fixture.ts`, a conversation the WASM engine wrote — Bob's storage, then Alice's messages, an update, a
  removal, a GroupInfo — which every other build must read (`fixture-scenario.ts`). The fixture is generated:
  `WRITE_MLS_FIXTURE=1 pnpm --filter @pinai/web exec vitest run test/mls-contract.spec.ts`. It adds no KeyPackage
  after the snapshot: openmls checks a KeyPackage's lifetime, and it would expire. `run.ts` plays scenarios where
  no test runner is: one after the other, each timed, a failure stopping none (`runScenarios`), and the line a run
  ends with (`summaryLine`), which the control screen logs and `mls:check` waits for.

## Why one package

The native build's machinery — the compiled Rust library per architecture, its Kotlin module, the build script —
lives in the mobile app (`apps/mobile`), which hands the engine its bundle. What is shared stays here, one package:
the engine, the leaf credential, the contract, and the WASM loader the web and desktop apps use. The mobile app never
imports `wasm.adapter.ts`, so it never loads `openmls-wasm`.

## Adding the native implementation

The engine is the `crypto/` workspace (root of the repo, not inside the web
app, precisely so a second build target can consume it): `openmls-core` holds
every rule, binding-agnostic, its failures `MlsError`s; `openmls-wasm` is a
thin wasm-bindgen facade over it. The native build is a second facade beside
it, and `contract/`'s scenarios are what it has to pass, on the phone.
