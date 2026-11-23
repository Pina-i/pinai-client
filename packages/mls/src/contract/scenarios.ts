/**
 * The engine's contract: what every build of the crate does through `MlsEngine`, played on the WASM
 * build by the web's tests (`apps/web/test/mls-contract.spec.ts`) and on the native one on the
 * phone. Plain TypeScript, no test runner: a scenario throws when it fails. The rules themselves
 * are tested in Rust (`crypto/openmls-core`); this checks a build carries them all, byte for byte.
 */

import type { ConversationId } from "@pinai/domain/models/e2ee"
import type { ProcessOutcome } from "@pinai/domain/ports/mls-engine.port"
import { check, fromUtf8, hex, refused, same, utf8 } from "./check"
import { readsTheWasmFixture } from "./fixture-scenario"
import { ALICE, BOB, CAROL, MALLORY, device, testCredential, type ContractEngine, type MakeEngine } from "./devices"

export interface Scenario {
    readonly name: string
    run(make: MakeEngine): Promise<void>
}

const GROUP: ConversationId = "00112233-4455-6677-8899-aabbccddeeff"
const OTHER_GROUP: ConversationId = "ffeeddcc-bbaa-9988-7766-554433221100"

/** RFC 9180 A.1.1: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM, sequence number 0. */
const VECTOR = {
    info: hex("4f6465206f6e2061204772656369616e2055726e"),
    skRm: hex("4612c550263fc8ad58375df3f557aac531d26850903e55a9f23f21d8534e8ac8"),
    enc: hex("37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431"),
    aad: hex("436f756e742d30"),
    pt: hex("4265617574792069732074727574682c20747275746820626561757479"),
    ct: hex("f938558b5d72f1a23810b4be2ab4f84331acc02fc97babc53a52ae8218a355a96d8770ac83d07bea87e13c512a"),
}

/** Alice's group with Bob, Bob in from Alice's Welcome; the add's outputs. */
async function aliceWithBob(make: MakeEngine) {
    const alice = await device(make, ALICE)
    const bob = await device(make, BOB)
    await alice.engine.createGroup(GROUP)
    const add = await alice.engine.addMember(GROUP, await bob.engine.createKeyPackage())
    await alice.engine.mergePendingCommit(GROUP)
    await bob.engine.joinGroup(GROUP, add.welcome, add.ratchet_tree)
    return { alice, bob, add }
}

/** `to` reads what `from` writes now. */
async function reads(from: ContractEngine, to: ContractEngine, words: string): Promise<void> {
    const outcome = await to.processMessage(GROUP, await from.encryptApplication(GROUP, utf8(words)))
    check(outcome.kind === "application" && fromUtf8(outcome.plaintext) === words, `a message reads as "${words}"`)
}

function asCommit(outcome: ProcessOutcome): Extract<ProcessOutcome, { kind: "commit" }> {
    check(outcome.kind === "commit", "a commit is read as one")
    return outcome
}

export const SCENARIOS: readonly Scenario[] = [
    {
        name: "binds a leaf key it holds, and its KeyPackages show the credential over that key",
        async run(make) {
            const bob = await device(make, BOB)
            same(await bob.engine.getDeviceSignaturePublicKey(), bob.key, "the bound key is the leaf key")
            const claim = await bob.engine.inspectKeyPackage(await bob.engine.createKeyPackage())
            same(claim.signatureKey, bob.key, "a KeyPackage carries the leaf key")
            check(claim.credential?.device_id === bob.credential.device_id, "a KeyPackage carries the credential")
            await refused(() => bob.engine.inspectKeyPackage(utf8("no KeyPackage")), "bytes that are no KeyPackage")
            const stranger = await make()
            await refused(() => stranger.setIdentity(testCredential(BOB), bob.key), "a key the engine doesn't hold")
        },
    },
    {
        name: "founds a group, adds a member by its KeyPackage, and the two read each other",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            check((await alice.engine.getEpoch(GROUP)) === (await bob.engine.getEpoch(GROUP)), "both at one epoch")
            await reads(alice.engine, bob.engine, "hello Bob")
            await reads(bob.engine, alice.engine, "hello Alice")
            const context = utf8("attachment-uuid")
            same(
                await alice.engine.exportSecret(GROUP, "pinai/attachment-key/v1", context, 32),
                await bob.engine.exportSecret(GROUP, "pinai/attachment-key/v1", context, 32),
                "both export one secret",
            )
            check(await bob.engine.hasGroup(GROUP), "the member holds the group")
            const known = await bob.engine.knownGroupIds()
            check(known.length === 1 && known[0] === GROUP, "the member knows that one group")
        },
    },
    {
        name: "joins from a Welcome alone, its ratchet tree inside",
        async run(make) {
            const alice = await device(make, ALICE)
            const bob = await device(make, BOB)
            await alice.engine.createGroup(GROUP)
            const add = await alice.engine.addMember(GROUP, await bob.engine.createKeyPackage())
            await alice.engine.mergePendingCommit(GROUP)
            await bob.engine.joinGroup(GROUP, add.welcome, null)
            await reads(alice.engine, bob.engine, "no tree needed")
        },
    },
    {
        name: "meets the leaf a commit brings in, and lists every leaf with its own marked",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            const carol = await device(make, CAROL)
            const addCarol = await alice.engine.addMember(GROUP, await carol.engine.createKeyPackage())
            await alice.engine.mergePendingCommit(GROUP)
            const seen = asCommit(await bob.engine.processMessage(GROUP, addCarol.commit))
            check(seen.joiner === null, "a member's commit has no joiner")
            check(seen.leavesMet.length === 1 && seen.leavesMet[0].leafIndex === 2, "the leaf met is the one added")
            same(seen.leavesMet[0].signatureKey, carol.key, "the leaf met carries the added key")
            const leaves = await bob.engine.groupLeaves(GROUP)
            check(leaves.map((l) => `${l.leafIndex}:${l.own}`).join() === "0:false,1:true,2:false", "every leaf, its own marked")
            const own = await bob.engine.ownLeafSignatureKey()
            check(own !== null, "a held group's own leaf key")
            same(own, bob.key, "the own leaf's key is the bound one")
            check(
                (await bob.engine.findLeafByDeviceId(GROUP, carol.credential.actor_uri, carol.credential.device_id)) === 2,
                "a device's leaf found by its credential",
            )
        },
    },
    {
        name: "puts a new credential in its own leaf, over the key the leaf carries",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            const renewed = { ...testCredential(ALICE, alice.credential.device_id), leaf_binding: "AQ==" }
            const { commit } = await alice.engine.updateOwnCredential(GROUP, renewed)
            await alice.engine.mergePendingCommit(GROUP)
            const met = asCommit(await bob.engine.processMessage(GROUP, commit)).leavesMet
            check(met.length === 1 && met[0].leafIndex === 0 && met[0].credential?.leaf_binding === "AQ==", "the leaf met carries the new credential")
            same(met[0].signatureKey, alice.key, "over the same key")
            await reads(alice.engine, bob.engine, "same key")
        },
    },
    {
        name: "removes a member, who reads nothing written after",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            const carol = await device(make, CAROL)
            const addCarol = await alice.engine.addMember(GROUP, await carol.engine.createKeyPackage())
            await alice.engine.mergePendingCommit(GROUP)
            await bob.engine.processMessage(GROUP, addCarol.commit)
            await carol.engine.joinGroup(GROUP, addCarol.welcome, null)
            const removal = await alice.engine.removeMember(GROUP, 2)
            await alice.engine.mergePendingCommit(GROUP)
            check(asCommit(await bob.engine.processMessage(GROUP, removal.commit)).leavesMet.length === 0, "a removal meets no leaf")
            check((await bob.engine.groupLeaves(GROUP)).length === 2, "two leaves left")
            const after = await alice.engine.encryptApplication(GROUP, utf8("without Carol"))
            await refused(() => carol.engine.processMessage(GROUP, after), "a message after the removal, at the member removed")
            check((await bob.engine.processMessage(GROUP, after)).kind === "application", "the others read on")
        },
    },
    {
        name: "updates its leaf, and the members follow to the next epoch",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            const before = await alice.engine.getEpoch(GROUP)
            const update = await alice.engine.update(GROUP)
            await alice.engine.mergePendingCommit(GROUP)
            asCommit(await bob.engine.processMessage(GROUP, update.commit))
            check((await bob.engine.getEpoch(GROUP)) === before + 1n, "one epoch on")
            await reads(alice.engine, bob.engine, "after the update")
        },
    },
    {
        name: "makes no commit while one is pending, drops it, and commits again",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            await alice.engine.removeMember(GROUP, 1)
            await refused(() => alice.engine.update(GROUP), "a commit while one is pending")
            await alice.engine.clearPendingCommit(GROUP)
            const update = await alice.engine.update(GROUP)
            await alice.engine.mergePendingCommit(GROUP)
            await bob.engine.processMessage(GROUP, update.commit)
            await reads(alice.engine, bob.engine, "still in step")
        },
    },
    {
        name: "reads a message a commit overtook",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            const sent = await alice.engine.encryptApplication(GROUP, utf8("before the commit"))
            const update = await alice.engine.update(GROUP)
            await alice.engine.mergePendingCommit(GROUP)
            await bob.engine.processMessage(GROUP, update.commit)
            const outcome = await bob.engine.processMessage(GROUP, sent)
            check(outcome.kind === "application" && fromUtf8(outcome.plaintext) === "before the commit", "the overtaken message reads")
        },
    },
    {
        name: "joins by external commit, apart until merged, then reads and is read",
        async run(make) {
            const { alice, bob, add } = await aliceWithBob(make)
            const laptop = await device(make, ALICE)
            const join = await laptop.engine.joinByExternalCommit(GROUP, add.group_info)
            check(!(await laptop.engine.hasGroup(GROUP)), "a pending join is not held")
            const seen = asCommit(await bob.engine.processMessage(GROUP, join.commit))
            await alice.engine.processMessage(GROUP, join.commit)
            await laptop.engine.mergePendingCommit(GROUP)
            check(await laptop.engine.hasGroup(GROUP), "a merged join is held")
            check((await laptop.engine.getEpoch(GROUP)) === join.epoch, "at the epoch its commit opened")
            const own = (await laptop.engine.groupLeaves(GROUP)).find((leaf) => leaf.own)
            check(own !== undefined && join.leaves.some((leaf) => leaf.own && leaf.leafIndex === own.leafIndex), "the tree the join showed")
            check(seen.joiner !== null && seen.joiner.leafIndex === own.leafIndex, "the members see the joiner where it sits")
            same(seen.joiner.signatureKey, laptop.key, "the joiner's key")
            await reads(laptop.engine, bob.engine, "back")
            await reads(bob.engine, laptop.engine, "welcome back")
        },
    },
    {
        name: "leaves nothing of a join the DS refused, and joins again",
        async run(make) {
            const { bob, add } = await aliceWithBob(make)
            const laptop = await device(make, ALICE)
            await laptop.engine.joinByExternalCommit(GROUP, add.group_info)
            await laptop.engine.clearPendingCommit(GROUP)
            check(!(await laptop.engine.hasGroup(GROUP)), "nothing held")
            const again = await laptop.engine.joinByExternalCommit(GROUP, add.group_info)
            await bob.engine.processMessage(GROUP, again.commit)
            await laptop.engine.mergePendingCommit(GROUP)
            check((await laptop.engine.getEpoch(GROUP)) === (await bob.engine.getEpoch(GROUP)), "in step with the member")
        },
    },
    {
        name: "refuses an external commit removing a leaf of another account than its joiner's",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            const carol = await device(make, CAROL)
            const addCarol = await alice.engine.addMember(GROUP, await carol.engine.createKeyPackage())
            await alice.engine.mergePendingCommit(GROUP)
            await bob.engine.processMessage(GROUP, addCarol.commit)
            const epoch = await bob.engine.getEpoch(GROUP)
            // A join over the key of a leaf in the tree removes that leaf: Carol's, here.
            await carol.engine.setIdentity(testCredential(MALLORY), carol.key)
            const intruding = await carol.engine.joinByExternalCommit(GROUP, addCarol.group_info)
            await refused(() => bob.engine.processMessage(GROUP, intruding.commit), "Mallory's join over Carol's leaf")
            check((await bob.engine.getEpoch(GROUP)) === epoch, "the group as it was")
            check((await bob.engine.groupLeaves(GROUP)).length === 3, "Carol's leaf still there")
        },
    },
    {
        name: "takes a Welcome from a later epoch over the group it holds",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            await alice.engine.removeMember(GROUP, 1)
            await alice.engine.mergePendingCommit(GROUP)
            const again = await alice.engine.addMember(GROUP, await bob.engine.createKeyPackage())
            await alice.engine.mergePendingCommit(GROUP)
            check(await bob.engine.rejoinGroup(GROUP, again.welcome), "a later Welcome replaces the group held")
            check((await bob.engine.getEpoch(GROUP)) === (await alice.engine.getEpoch(GROUP)), "at the Welcome's epoch")
            await reads(alice.engine, bob.engine, "welcome back")
        },
    },
    {
        name: "deletes a group it holds",
        async run(make) {
            const { bob } = await aliceWithBob(make)
            await bob.engine.deleteGroup(GROUP)
            check(!(await bob.engine.hasGroup(GROUP)), "the group is gone")
            check((await bob.engine.knownGroupIds()).length === 0, "no group known")
        },
    },
    {
        name: "picks up where it was from a snapshot of its storage",
        async run(make) {
            const { alice, bob } = await aliceWithBob(make)
            const snapshot = await bob.engine.serializeStorage()
            const known = await bob.engine.knownGroupIds()
            await bob.engine.resetProvider()
            await bob.engine.initialize()
            check(!(await bob.engine.hasGroup(GROUP)), "a reset holds nothing")
            await bob.engine.restoreStorage(snapshot, known)
            check(await bob.engine.hasGroup(GROUP), "the group is back")
            await reads(alice.engine, bob.engine, "after the reload")
            await reads(bob.engine, alice.engine, "and back")
        },
    },
    {
        name: "seals and opens with HPKE, RFC 9180's vector included",
        async run(make) {
            const hpke = await make()
            const vector = { enc: VECTOR.enc, ciphertext: VECTOR.ct }
            same(await hpke.open(VECTOR.skRm, vector, VECTOR.info, VECTOR.aad), VECTOR.pt, "the RFC's ciphertext opens to its plaintext")
            await refused(() => hpke.open(VECTOR.skRm, vector, utf8("another info"), VECTOR.aad), "the RFC's ciphertext under another info")
            const pair = await hpke.generateKeyPair()
            const sealed = await hpke.seal(pair.publicKey, utf8("info"), utf8("aad"), utf8("the 24 words"))
            check(sealed.enc.length === 32, "a 32-byte enc")
            check(fromUtf8(await hpke.open(pair.privateKey, sealed, utf8("info"), utf8("aad"))) === "the 24 words", "a seal opens under its private key")
            await refused(() => hpke.seal(new Uint8Array(32), utf8("info"), utf8("aad"), utf8("secret")), "a seal to a low-order key")
        },
    },
    {
        name: "refuses bytes that are not what they claim, and goes on working",
        async run(make) {
            const { alice, bob, add } = await aliceWithBob(make)
            const garbage = utf8("no MLS here")
            await refused(() => bob.engine.processMessage(GROUP, garbage), "garbage as a message")
            await refused(() => bob.engine.joinGroup(OTHER_GROUP, garbage, null), "garbage as a Welcome")
            await refused(() => bob.engine.joinByExternalCommit(OTHER_GROUP, garbage), "garbage as a GroupInfo")
            await refused(() => bob.engine.joinByExternalCommit(OTHER_GROUP, add.group_info), "another group's GroupInfo")
            await reads(alice.engine, bob.engine, "still fine")
        },
    },
    readsTheWasmFixture,
]
