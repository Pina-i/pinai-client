import { KEYPAIR } from "@pinai/crypto/contract/storage/fixtures"
import { sealed } from "@pinai/crypto/contract/storage/world"
import { alike, check, fromUtf8, utf8 } from "@pinai/domain/lib/contract"
import type { ConversationId } from "@pinai/domain/models/e2ee"
import { asActorUri } from "@pinai/domain/models/identity"
import { ALICE, BOB, type ContractEngine, device } from "@pinai/mls/contract/devices"
import { createMlsEngine } from "@/ioc"
import { checkStores } from "@/ioc/check-stores"

const GROUP = "5e57a470-0000-4000-8000-000000000001" as ConversationId
const ALICE_ACCOUNT = asActorUri(ALICE)
const BOB_ACCOUNT = asActorUri(BOB)

// The same names before and after the restart: that's the point.
const stores = () => checkStores("restart-check")

async function makeEngine(): Promise<ContractEngine> {
    const engine = createMlsEngine()
    await engine.initialize()
    return engine
}

/** Alice's group with Bob, both MLS states and a sealed marker saved; the stores closed, never deleted. */
export async function writeRestartState(): Promise<void> {
    const world = stores()
    try {
        const aliceStore = sealed(world, ALICE_ACCOUNT)
        const bobStore = sealed(world, BOB_ACCOUNT)
        // What an earlier run left, if it stopped half-way.
        await aliceStore.clear()
        await bobStore.clear()

        const alice = await device(makeEngine, ALICE)
        const bob = await device(makeEngine, BOB)
        await alice.engine.createGroup(GROUP)
        const add = await alice.engine.addMember(GROUP, await bob.engine.createKeyPackage())
        await alice.engine.mergePendingCommit(GROUP)
        await bob.engine.joinGroup(GROUP, add.welcome, add.ratchet_tree)

        await aliceStore.saveMlsSnapshot({ provider_state: await alice.engine.serializeStorage(), known_group_ids: [GROUP] })
        await bobStore.saveMlsSnapshot({ provider_state: await bob.engine.serializeStorage(), known_group_ids: [GROUP] })
        await aliceStore.saveIdentityKeypair(KEYPAIR)
    } finally {
        await world.close()
    }
}

/** Everything back after the restart, Bob reading what Alice writes; then the stores and keys deleted. */
export async function readRestartState(): Promise<void> {
    const world = stores()
    try {
        const aliceStore = sealed(world, ALICE_ACCOUNT)
        const bobStore = sealed(world, BOB_ACCOUNT)
        check(alike(await aliceStore.loadIdentityKeypair(), KEYPAIR), "the sealed marker survives the restart")

        const aliceSnapshot = await aliceStore.loadMlsSnapshot()
        const bobSnapshot = await bobStore.loadMlsSnapshot()
        check(aliceSnapshot !== null && bobSnapshot !== null, "both MLS states survive the restart")
        const alice = await makeEngine()
        const bob = await makeEngine()
        await alice.restoreStorage(aliceSnapshot.provider_state, aliceSnapshot.known_group_ids)
        await bob.restoreStorage(bobSnapshot.provider_state, bobSnapshot.known_group_ids)
        check((await alice.hasGroup(GROUP)) && (await bob.hasGroup(GROUP)), "both groups come back")

        const words = "after the restart"
        const outcome = await bob.processMessage(GROUP, await alice.encryptApplication(GROUP, utf8(words)))
        check(outcome.kind === "application" && fromUtf8(outcome.plaintext) === words, "Bob reads what Alice writes after the restart")
    } finally {
        await world.dispose()
    }
}
