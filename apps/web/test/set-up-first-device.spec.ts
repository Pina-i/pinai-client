import { describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import { asActorUri } from "@pinai/domain/models/identity"
import type { GateSession } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"
import { PENDING_RECHECK_MS, setUpFirstDeviceUseCase, type SetUpFirstDeviceDeps } from "@pinai/domain/usecases/e2ee/set-up-first-device.usecase"

const SESSION: GateSession = { idpUrl: "https://idp.example", accessToken: "token", actorUri: asActorUri("https://idp.example/users/alice") }
const WORDS = ["lagoon", "basalt"]

function rig(over: Partial<SetUpFirstDeviceDeps> = {}) {
    const e2eePort = {
        loadStoredPassphrase: vi.fn(async (): Promise<string[] | null> => null),
        newWordsToShow: vi.fn(async (): Promise<{ generation: number; words: string[] } | null> => null),
        pendingHistoryKey: vi.fn(async (): Promise<object | null> => null),
        newestHistoryGeneration: vi.fn(async (): Promise<number | null> => null),
    }
    const deps = {
        e2eePort,
        bootstrap: vi.fn(async () => ({ kind: "holds" as const, words: WORDS })),
        gateRoute: vi.fn(async () => "new-device" as const),
        signInAgainOnDeviceMismatch: vi.fn(async () => false),
        ...over,
    } as unknown as SetUpFirstDeviceDeps
    return { deps, e2eePort, run: setUpFirstDeviceUseCase(deps) }
}

describe("setUpFirstDeviceUseCase", () => {
    it("shows the first device's words, the stage told first: running with nothing kept, checking with words kept", async () => {
        const fresh = rig()
        const stages: string[] = []
        expect(await fresh.run(SESSION, (stage) => stages.push(stage))).toEqual({ kind: "words", words: WORDS })

        const reloaded = rig()
        reloaded.e2eePort.loadStoredPassphrase.mockResolvedValue(WORDS)
        await reloaded.run(SESSION, (stage) => stages.push(stage))

        expect(stages).toEqual(["running", "checking"])
        expect(fresh.deps.bootstrap).toHaveBeenCalledWith(SESSION)
    })

    it("shows a start over's new words, not gone past, over anything else", async () => {
        const { e2eePort, run } = rig()
        e2eePort.newWordsToShow.mockResolvedValue({ generation: 2, words: ["new"] })
        expect(await run(SESSION)).toEqual({ kind: "new-words", words: ["new"] })
    })

    it("on an account with a key: tries again later while a pending key waits, else goes where the gate sends it", async () => {
        const waiting = rig({ bootstrap: vi.fn(async () => ({ kind: "has-key" as const })) } as Partial<SetUpFirstDeviceDeps>)
        waiting.e2eePort.pendingHistoryKey.mockResolvedValue({})
        expect(await waiting.run(SESSION)).toEqual({ kind: "retry", afterMs: PENDING_RECHECK_MS })

        const elsewhere = rig({ bootstrap: vi.fn(async () => ({ kind: "has-key" as const })) } as Partial<SetUpFirstDeviceDeps>)
        expect(await elsewhere.run(SESSION)).toEqual({ kind: "go", route: "new-device" })
        expect(elsewhere.deps.gateRoute).toHaveBeenCalledWith(SESSION)
    })

    it("leaves a session naming another device to signing in again", async () => {
        const mismatch = new IdpError(403, "device_mismatch", "Another device")
        const { run, deps } = rig({ bootstrap: vi.fn(async () => Promise.reject(mismatch)) } as Partial<SetUpFirstDeviceDeps>)
        vi.mocked(deps.signInAgainOnDeviceMismatch).mockResolvedValue(true)
        expect(await run(SESSION)).toEqual({ kind: "signing-in-again" })
    })

    it("after a failure: new words if any; offline, the first generation's words kept; else what failed", async () => {
        const down = () => vi.fn(async () => Promise.reject(new Error("IdP down")))

        const newWords = rig({ bootstrap: down() } as Partial<SetUpFirstDeviceDeps>)
        newWords.e2eePort.newWordsToShow.mockResolvedValue({ generation: 2, words: ["new"] })
        expect(await newWords.run(SESSION)).toEqual({ kind: "new-words", words: ["new"] })

        const offline = rig({ bootstrap: down() } as Partial<SetUpFirstDeviceDeps>)
        offline.e2eePort.loadStoredPassphrase.mockResolvedValue(WORDS)
        offline.e2eePort.newestHistoryGeneration.mockResolvedValue(1)
        expect(await offline.run(SESSION)).toEqual({ kind: "words", words: WORDS })

        const later = rig({ bootstrap: down() } as Partial<SetUpFirstDeviceDeps>)
        later.e2eePort.loadStoredPassphrase.mockResolvedValue(WORDS)
        later.e2eePort.newestHistoryGeneration.mockResolvedValue(2)
        expect(await later.run(SESSION)).toEqual({ kind: "failed", message: "IdP down" })
    })

    it("stops once cancelled, nothing set up", async () => {
        let cancelled = false
        const { run, deps, e2eePort } = rig()
        e2eePort.loadStoredPassphrase.mockImplementation(async () => {
            cancelled = true
            return null
        })
        expect(await run(SESSION, undefined, () => cancelled)).toEqual({ kind: "cancelled" })
        expect(deps.bootstrap).not.toHaveBeenCalled()
    })
})
