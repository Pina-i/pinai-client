/** `SealedStorage` over the real adapters: every row sealed, read back as saved, per account. */

import { alike, check, fromUtf8, refused } from "@pinai/domain/lib/contract"
import { ATTESTATION, BEFORE, bytes, KEPT, KEYPAIR, NO_TRUST, PARTNER, PARTNER_APPROVAL, PENDING, PHONE, SNAPSHOT, TABLET, WORDS } from "./fixtures"
import { ALICE, inWorld, PIERRE, sealed, type StorageScenario } from "./world"

const UUID = /^[0-9a-f-]{36}$/

export const SEALED_STORAGE_SCENARIOS: readonly StorageScenario[] = [
    {
        name: "mints a device id once, for every caller at once, and every later instance",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                const ids = await Promise.all(Array.from({ length: 4 }, () => storage.getOrCreateDeviceId()))

                check(UUID.test(ids[0]), "a device id is a UUID")
                check(new Set(ids).size === 1, "callers racing get one device id")
                check((await storage.getOrCreateDeviceId()) === ids[0], "a device id asked again is the same")
                check((await sealed(world).getOrCreateDeviceId()) === ids[0], "a new instance sees the device id")
            }),
    },
    {
        name: "round-trips an identity, an MLS snapshot and an attestation, every key as bytes",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                await storage.saveIdentityKeypair(KEYPAIR)
                await storage.saveMlsSnapshot(SNAPSHOT)
                await storage.saveDeviceAttestation(ATTESTATION)

                const later = sealed(world)
                check(alike(await later.loadIdentityKeypair(), KEYPAIR), "the identity reads back")
                check(alike(await later.loadMlsSnapshot(), SNAPSHOT), "the MLS snapshot reads back")
                check(alike(await later.loadDeviceAttestation(), ATTESTATION), "the attestation reads back")
            }),
    },
    {
        name: "round-trips the kept and pending words, the standing and the newest generation seen",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                await storage.saveKeptPassphrase(KEPT)
                await storage.savePendingPassphrase(PENDING)
                await storage.saveHistoryKeyStanding({ kind: "mismatch", generation: 3, setByDevice: "d2", reason: "rollback", held: 2 })
                await storage.saveNewestHistoryGeneration(3)

                check(alike(await storage.loadKeptPassphrase(), KEPT), "the kept words read back")
                check(alike(await storage.loadPendingPassphrase(), PENDING), "the pending words read back")
                const standing = await storage.loadHistoryKeyStanding()
                check(standing?.kind === "mismatch" && standing.reason === "rollback", "the standing reads back")
                check((await storage.loadNewestHistoryGeneration()) === 3, "the newest generation reads back")
                await storage.clearPendingPassphrase()
                check((await storage.loadPendingPassphrase()) === null, "cleared pending words read as none")
            }),
    },
    {
        name: "reads a pending row from before its time was kept, and keeps the new words' generation",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                const { words, key, hak } = PENDING
                const row = {
                    words,
                    generation: key.generation,
                    salt: Array.from(key.salt),
                    check_value: Array.from(key.checkValue),
                    approval_public_key: Array.from(key.approvalPublicKey),
                    hak: Array.from(hak),
                }
                await storage["seal"]("recovery_passphrase", row, "pending")

                check(
                    alike(await storage.loadPendingPassphrase(), { ...PENDING, mintedAt: null }),
                    "an older pending row reads, minted at no known time"
                )
                await storage.saveNewWordsGeneration(3)
                check((await storage.loadNewWordsGeneration()) === 3, "the new words' generation reads back")
                await storage.clearNewWordsGeneration()
                check((await storage.loadNewWordsGeneration()) === null, "a cleared new words' generation reads as none")
            }),
    },
    {
        name: "sets aside a row of words it can't read: words alone, a short salt, 23 words, bytes no key opens",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                const { kv } = world.open(ALICE)
                const json = { ...KEPT, approved_root_key: null, salt: Array.from(KEPT.derived.salt), hak: Array.from(KEPT.derived.hak) }

                for (const unreadable of [{ words: WORDS }, { ...json, salt: [1, 2] }, { ...json, words: WORDS.slice(1) }]) {
                    await storage["seal"]("recovery_passphrase", unreadable)
                    check((await storage.loadKeptPassphrase()) === null, "a row it can't read gives no words")
                    check((await kv.get("recovery_passphrase", "current")) === undefined, "a row it can't read is moved aside")
                }
                await kv.put("recovery_passphrase", "current", bytes(40, 64))
                check((await storage.loadKeptPassphrase()) === null, "bytes no key opens give no words")
                check((await kv.get("recovery_passphrase", "current")) === undefined, "bytes no key opens are moved aside")
            }),
    },
    {
        name: "adds to what it keeps of the account's devices, starting from nothing",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                check(alike(await storage.loadDeviceTrust(), { trust: NO_TRUST, unreadable: [] }), "a fresh store trusts no device")

                await storage.addToDeviceTrust({ seen: [PHONE], approved: [PHONE] })
                const added = await storage.addToDeviceTrust({
                    approved: [TABLET],
                    revoked: ["watch"],
                    partners: [PARTNER],
                    partnerApprovals: [PARTNER_APPROVAL],
                    baselines: [2],
                    before: [BEFORE],
                })
                await storage.addToDeviceTrust({
                    partners: [{ ...PARTNER }],
                    baselines: [2],
                    before: [{ generation: 2, cause: "replacement", devices: [], refused: [] }],
                })

                const trust = {
                    seen: [PHONE],
                    approved: [PHONE, TABLET],
                    revoked: ["watch"],
                    partners: [PARTNER],
                    partnerApprovals: [PARTNER_APPROVAL],
                    baselines: [2],
                    before: [BEFORE],
                }
                check(alike(added, trust), "an add answers all it keeps")
                check(alike(await sealed(world).loadDeviceTrust(), { trust, unreadable: [] }), "what it keeps reads back, every key as bytes")
                const { kv } = world.open(ALICE)
                for (const row of ["trust:partners", "trust:partner-approvals", "trust:baselines", "trust:before"]) {
                    check((await kv.get("device_attestation", row)) !== undefined, `${row} is a row of its own`)
                }
            }),
    },
    {
        name: "keeps what another instance added meanwhile: each row read again just before it is written",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                const other = sealed(world)
                await storage.loadDeviceTrust()
                await other.loadDeviceTrust()

                await other.addToDeviceTrust({ revoked: ["watch"], seen: [PHONE] })
                await storage.addToDeviceTrust({ revoked: ["tablet"], seen: [TABLET] })

                const { trust } = await sealed(world).loadDeviceTrust()
                check(alike(trust.revoked, ["watch", "tablet"]), "both instances' revocations are kept")
                check(
                    alike(
                        trust.seen.map((device) => device.deviceId),
                        ["phone", "tablet"]
                    ),
                    "both instances' devices are kept"
                )
            }),
    },
    {
        name: "sets aside a trust row it can't read, names it, and reads the others",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                const { kv } = world.open(ALICE)
                await storage.addToDeviceTrust({ seen: [PHONE], revoked: ["watch"] })
                await storage["seal"]("device_attestation", { devices: [{ device_id: "phone", root_key: [1, 2] }] }, "trust:approved")
                await storage["seal"]("device_attestation", { before: [{ generation: 0, devices: [] }] }, "trust:before")
                await kv.put("device_attestation", "trust:revoked", bytes(42, 64))

                check(
                    alike(await storage.loadDeviceTrust(), { trust: { ...NO_TRUST, seen: [PHONE] }, unreadable: ["approved", "revoked", "before"] }),
                    "the readable rows read, the others are named"
                )
                check((await kv.get("device_attestation", "trust:approved")) === undefined, "an unreadable row is moved aside")
                check((await kv.get("device_attestation", "trust:revoked")) === undefined, "a row no key opens is moved aside")
                check((await kv.get("device_attestation", "trust:seen")) !== undefined, "a readable row stays")
            }),
    },
    {
        name: "round-trips the bound actor, replaces a row saved again, and starts with nothing",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                check((await storage.loadIdentityKeypair()) === null, "a fresh store has no identity")
                check((await storage.loadMlsSnapshot()) === null, "a fresh store has no MLS snapshot")
                check((await storage.loadDeviceAttestation()) === null, "a fresh store has no attestation")
                check((await storage.loadKeptPassphrase()) === null, "a fresh store has no words")
                check((await storage.loadHistoryKeyStanding()) === null, "a fresh store has no standing")
                check((await storage.getBoundActorUri()) === null, "a fresh store is bound to no actor")

                await storage.setBoundActorUri(ALICE)
                check((await sealed(world).getBoundActorUri()) === ALICE, "the bound actor reads back")
                await storage.saveIdentityKeypair(KEYPAIR)
                const replacement = { ...KEYPAIR, msk_public: bytes(99) }
                await storage.saveIdentityKeypair(replacement)
                check(alike(await storage.loadIdentityKeypair(), replacement), "a row saved again reads as the second save")
            }),
    },
    {
        name: "stores rows sealed: no word reads in the bytes it keeps",
        run: (make) =>
            inWorld(make, async (world) => {
                await sealed(world).saveKeptPassphrase(KEPT)

                const raw = await world.open(ALICE).kv.get("recovery_passphrase", "current")
                check(raw !== undefined, "the words are stored")
                check(!fromUtf8(raw).includes("word1"), "the stored bytes hold no word in the clear")
            }),
    },
    {
        name: "keeps each account's device when another account on the same device clears its own",
        run: (make) =>
            inWorld(make, async (world) => {
                const alice = sealed(world, ALICE)
                const pierre = sealed(world, PIERRE)
                await alice.saveIdentityKeypair(KEYPAIR)
                await alice.setBoundActorUri(ALICE)

                check((await pierre.loadIdentityKeypair()) === null, "another account sees none of it")
                await pierre.saveIdentityKeypair({ ...KEYPAIR, msk_public: bytes(42) })
                await pierre.clear()

                check(alike(await sealed(world, ALICE).loadIdentityKeypair(), KEYPAIR), "the first account's identity still opens")
                check((await sealed(world, ALICE).getBoundActorUri()) === ALICE, "the first account is still bound")
            }),
    },
    {
        name: "clears every row and the key, the device id with them",
        run: (make) =>
            inWorld(make, async (world) => {
                const storage = sealed(world)
                const deviceId = await storage.getOrCreateDeviceId()
                await storage.saveIdentityKeypair(KEYPAIR)
                await storage.saveMlsSnapshot(SNAPSHOT)
                await storage.saveDeviceAttestation(ATTESTATION)
                await storage.saveKeptPassphrase(KEPT)
                await storage.addToDeviceTrust({ revoked: ["watch"] })
                const before = await world.open(ALICE).deviceKey.seal(bytes(5))

                await storage.clear()

                const later = sealed(world)
                check(alike((await later.loadDeviceTrust()).trust, NO_TRUST), "no device trust is left")
                check((await later.loadIdentityKeypair()) === null, "no identity is left")
                check((await later.loadMlsSnapshot()) === null, "no MLS snapshot is left")
                check((await later.loadDeviceAttestation()) === null, "no attestation is left")
                check((await later.loadKeptPassphrase()) === null, "no words are left")
                check((await later.getOrCreateDeviceId()) !== deviceId, "a new device id is minted")
                await refused(() => world.open(ALICE).deviceKey.open(before), "a seal from before the clear")
            }),
    },
]
