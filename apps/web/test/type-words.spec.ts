import { describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import { asActorUri } from "@pinai/domain/models/identity"
import type { GateSession } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"
import { typeWordsUseCase, type TypeWordsDeps } from "@pinai/domain/usecases/e2ee/type-words.usecase"

const SESSION: GateSession = { idpUrl: "https://idp.example", accessToken: "token", actorUri: asActorUri("https://idp.example/users/alice") }
const WORDS = Array.from({ length: 24 }, () => "abandon")

function rig(over: Partial<TypeWordsDeps> = {}) {
    const deps: TypeWordsDeps = {
        restoreFromWords: vi.fn(async () => ({ kind: "kept" as const, generation: 1 })),
        restoreDue: vi.fn(async () => ({ kind: "restored" as const, generation: 1, messages: 12, skipped: 0 })),
        signInAgainOnDeviceMismatch: vi.fn(async () => false),
        ...over,
    }
    return { deps, run: typeWordsUseCase(deps) }
}

describe("typeWordsUseCase", () => {
    it("keeps the words, then brings the history back: how many messages, or that it failed", async () => {
        expect(await rig().run(SESSION, WORDS)).toEqual({ kind: "kept", restore: { kind: "restored", messages: 12 } })

        const nothing = rig({ restoreDue: vi.fn(async () => ({ kind: "idle" as const })) })
        expect(await nothing.run(SESSION, WORDS)).toEqual({ kind: "kept", restore: { kind: "restored", messages: 0 } })

        const failed = rig({ restoreDue: vi.fn(async () => ({ kind: "failed" as const, generation: 1, error: new Error("x") })) })
        expect(await failed.run(SESSION, WORDS)).toEqual({ kind: "kept", restore: { kind: "failed" } })
    })

    it("says why words are refused, and restores nothing", async () => {
        const { deps, run } = rig({ restoreFromWords: vi.fn(async () => ({ kind: "wrong-passphrase" as const })) })
        expect(await run(SESSION, WORDS)).toEqual({ kind: "refused", reason: "wrong-passphrase" })
        expect(deps.restoreDue).not.toHaveBeenCalled()
    })

    it("waits for the screen's own setup before checking anything", async () => {
        const order: string[] = []
        const { run } = rig({
            restoreFromWords: vi.fn(async () => {
                order.push("check")
                return { kind: "kept" as const, generation: 1 }
            }),
        })
        await run(SESSION, WORDS, async () => void order.push("ready"))
        expect(order).toEqual(["ready", "check"])
    })

    it("signs in again on a session naming another device; says any other failure", async () => {
        const mismatch = rig({ restoreFromWords: vi.fn(async () => Promise.reject(new IdpError(403, "device_mismatch", "x"))) })
        vi.mocked(mismatch.deps.signInAgainOnDeviceMismatch).mockResolvedValue(true)
        expect(await mismatch.run(SESSION, WORDS)).toEqual({ kind: "signing-in-again" })

        const down = rig({ restoreFromWords: vi.fn(async () => Promise.reject(new Error("IdP down"))) })
        expect(await down.run(SESSION, WORDS)).toEqual({ kind: "failed", message: "IdP down" })
    })
})
