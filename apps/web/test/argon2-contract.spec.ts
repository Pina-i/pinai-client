import { describe, it } from "vitest"

import { nobleArgon2id } from "@pinai/crypto/argon2"
import { ARGON2_SCENARIOS } from "@pinai/crypto/contract/argon2/scenarios"

describe("the Argon2id contract, on @noble", () => {
    for (const scenario of ARGON2_SCENARIOS) {
        it(scenario.name, () => scenario.run(async () => nobleArgon2id), 30_000)
    }
})
