/**
 * A conversation the WASM engine wrote (`wasm-fixture.ts`, generated): Bob's storage at one epoch,
 * then what Alice sent after — messages, an update, Carol's removal — and the GroupInfo of the last
 * epoch. Another build of the crate reads it as the WASM one does: the snapshot format and the
 * wire alike. No KeyPackage is added after the snapshot, nor inspected: openmls checks a
 * KeyPackage's lifetime, a year, and the fixture would expire.
 */

import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import { utf8 } from "@pinai/domain/lib/contract"

import { ALICE, BOB, CAROL, device, type MakeEngine } from "./devices"

export interface WasmFixture {
    conversationId: string
    /** Bob's provider, base64, his group at epoch 2. */
    bobStorage: string
    /** What Bob reads in order, base64; `text` null for a commit. */
    steps: { message: string; text: string | null }[]
    /** The GroupInfo of the last epoch, base64. */
    groupInfo: string
    /** Bob's epoch once every step is read. */
    epoch: number
}

export const FIXTURE_GROUP = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"

export async function makeFixture(make: MakeEngine): Promise<WasmFixture> {
    const alice = await device(make, ALICE)
    const bob = await device(make, BOB)
    const carol = await device(make, CAROL)
    await alice.engine.createGroup(FIXTURE_GROUP)
    const addBob = await alice.engine.addMember(FIXTURE_GROUP, await bob.engine.createKeyPackage())
    await alice.engine.mergePendingCommit(FIXTURE_GROUP)
    await bob.engine.joinGroup(FIXTURE_GROUP, addBob.welcome, null)
    const addCarol = await alice.engine.addMember(FIXTURE_GROUP, await carol.engine.createKeyPackage())
    await alice.engine.mergePendingCommit(FIXTURE_GROUP)
    await bob.engine.processMessage(FIXTURE_GROUP, addCarol.commit)
    const bobStorage = await bob.engine.serializeStorage()

    const steps: { message: Uint8Array; text: string | null }[] = []
    const say = async (text: string) => {
        steps.push({ message: await alice.engine.encryptApplication(FIXTURE_GROUP, utf8(text)), text })
    }
    await say("one")
    const update = await alice.engine.update(FIXTURE_GROUP)
    await alice.engine.mergePendingCommit(FIXTURE_GROUP)
    steps.push({ message: update.commit, text: null })
    await say("two")
    const removal = await alice.engine.removeMember(FIXTURE_GROUP, 2)
    await alice.engine.mergePendingCommit(FIXTURE_GROUP)
    steps.push({ message: removal.commit, text: null })
    await say("three")

    return {
        conversationId: FIXTURE_GROUP,
        bobStorage: bytesToBase64(bobStorage),
        steps: steps.map((step) => ({ message: bytesToBase64(step.message), text: step.text })),
        groupInfo: bytesToBase64(removal.group_info),
        epoch: Number(await alice.engine.getEpoch(FIXTURE_GROUP)),
    }
}

/** The fixture as the TypeScript module the other builds import. */
export function fixtureModule(fixture: WasmFixture): string {
    return [
        "// Written by the WASM engine: `WRITE_MLS_FIXTURE=1 pnpm --filter @pinai/web exec vitest run test/mls-contract.spec.ts`.",
        "// Never edited by hand.",
        'import type { WasmFixture } from "./fixture"',
        "",
        `export const WASM_FIXTURE: WasmFixture = ${JSON.stringify(fixture, null, 4)}`,
        "",
    ].join("\n")
}
