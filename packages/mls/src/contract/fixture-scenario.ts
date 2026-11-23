import { base64ToBytes } from "@pinai/domain/lib/bytes"

import { check, fromUtf8 } from "./check"
import { ALICE, device } from "./devices"
import type { Scenario } from "./scenarios"
import { WASM_FIXTURE } from "./wasm-fixture"

export const readsTheWasmFixture: Scenario = {
    name: "reads a conversation the WASM engine wrote, from its storage on",
    async run(make) {
        const fixture = WASM_FIXTURE
        const group = fixture.conversationId
        const bob = await make()
        await bob.restoreStorage(base64ToBytes(fixture.bobStorage), [group])
        check(await bob.hasGroup(group), "the WASM snapshot's group loads")
        for (const [i, step] of fixture.steps.entries()) {
            const outcome = await bob.processMessage(group, base64ToBytes(step.message))
            if (step.text === null) check(outcome.kind === "commit", `step ${i + 1} reads as a commit`)
            else check(outcome.kind === "application" && fromUtf8(outcome.plaintext) === step.text, `step ${i + 1} reads as "${step.text}"`)
        }
        check(Number(await bob.getEpoch(group)) === fixture.epoch, "at the epoch Alice reached")
        check((await bob.groupLeaves(group)).length === 2, "Carol's leaf removed")
        const laptop = await device(make, ALICE)
        const join = await laptop.engine.joinByExternalCommit(group, base64ToBytes(fixture.groupInfo))
        check(Number(join.epoch) === fixture.epoch + 1, "a join from the WASM GroupInfo opens the next epoch")
    },
}
