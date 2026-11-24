import { describe, expect, it, vi } from "vitest"

import type { DeviceListEntry } from "@pinai/domain/models/device"
import { IdpError } from "@pinai/domain/models/idp-error"
import { asActorUri } from "@pinai/domain/models/identity"
import { enterRestorePageUseCase, type EnterRestorePageDeps } from "@pinai/domain/usecases/e2ee/enter-restore-page.usecase"
import type { GateSession } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"

const SESSION: GateSession = { idpUrl: "https://idp.example", accessToken: "token", actorUri: asActorUri("https://idp.example/users/alice") }
const HOLDS = { kind: "holds", generation: 2, settled: true }
const NO_PASSPHRASE = { kind: "no-passphrase", generation: 2 }
const NEWER = { kind: "mismatch", reason: "check-value", held: 2, generation: 3, setByDevice: "laptop" }
const UNKNOWN = { kind: "mismatch", reason: "rollback", held: 2, generation: 2, setByDevice: null }
const IN = { kind: "in", by: "passphrase" }
const OUT = { kind: "out" }

function rig(over: Partial<EnterRestorePageDeps> = {}) {
    const e2eePort = {
        historyKeyStanding: vi.fn(async () => NO_PASSPHRASE as never),
        pendingHistoryKey: vi.fn(async () => null as never),
        newWordsToShow: vi.fn(async () => null as never),
        resetSetter: vi.fn(async () => ({ deviceId: "laptop", approved: true, self: false }) as never),
    }
    const deps = {
        e2eePort,
        setUp: vi.fn(async () => undefined),
        checkAdmission: vi.fn(async () => ({ standing: NO_PASSPHRASE, admission: OUT }) as never),
        listDevices: vi.fn(async () => [{ device_id: "laptop", display_name: "Laptop " } as DeviceListEntry]),
        signInAgainOnDeviceMismatch: vi.fn(async () => false),
        warn: vi.fn(),
        ...over,
    } as unknown as EnterRestorePageDeps
    return { deps, e2eePort, enter: enterRestorePageUseCase(deps) }
}

describe("enterRestorePageUseCase", () => {
    it("sends a pending key to the setup page that settles it, nothing set up here", async () => {
        const { e2eePort, enter, deps } = rig()
        e2eePort.pendingHistoryKey.mockResolvedValue({} as never)
        expect(await enter(SESSION, "new-device")).toEqual({ kind: "go", route: "setup" })
        expect(deps.setUp).not.toHaveBeenCalled()
    })

    it("shows a start over's new words, nothing set up here", async () => {
        const { e2eePort, enter, deps } = rig()
        e2eePort.newWordsToShow.mockResolvedValue({ generation: 3, words: ["new"] } as never)
        expect(await enter(SESSION, "new-device")).toEqual({ kind: "new-words", words: ["new"] })
        expect(deps.setUp).not.toHaveBeenCalled()
    })

    it("sets the device up, says so at once, then reads whether it is in and whether it lacks the words", async () => {
        const { enter, deps } = rig()
        const order: string[] = []
        vi.mocked(deps.setUp).mockImplementation(async () => void order.push("set up"))
        vi.mocked(deps.checkAdmission).mockImplementation(async () => {
            order.push("checked")
            return { standing: NO_PASSPHRASE, admission: OUT } as never
        })

        const entry = await enter(SESSION, "new-device", { onDeviceReady: () => order.push("ready told") })

        expect(order).toEqual(["set up", "ready told", "checked"])
        expect(entry).toEqual({ kind: "ready", read: { isIn: false, lacksWords: true, reset: { cause: null, replacedOn: null, refused: null } } })
    })

    it("on the reset page, sends a device let in meanwhile back to the app", async () => {
        const { enter, deps } = rig()
        vi.mocked(deps.checkAdmission).mockResolvedValue({ standing: HOLDS, admission: IN } as never)
        expect(await enter(SESSION, "reset")).toEqual({ kind: "home" })
    })

    it("after a newer generation on the reset page, names the device found approved that replaced the words, and refuses it", async () => {
        const { enter, deps } = rig()
        vi.mocked(deps.checkAdmission).mockResolvedValue({ standing: NEWER, admission: OUT } as never)
        expect(await enter(SESSION, "reset")).toEqual({
            kind: "ready",
            read: { isIn: false, lacksWords: true, reset: { cause: "newer-generation", replacedOn: "Laptop", refused: "laptop" } },
        })
    })

    it("reads on when who replaced the words can't be read, said", async () => {
        const { enter, deps } = rig({ listDevices: vi.fn(async () => Promise.reject(new Error("down"))) } as Partial<EnterRestorePageDeps>)
        vi.mocked(deps.checkAdmission).mockResolvedValue({ standing: NEWER, admission: OUT } as never)
        const entry = await enter(SESSION, "reset")
        expect(entry).toEqual({
            kind: "ready",
            read: { isIn: false, lacksWords: true, reset: { cause: "newer-generation", replacedOn: null, refused: null } },
        })
        expect(deps.warn).toHaveBeenCalledWith("reading who replaced the words", expect.any(Error))
    })

    it("says an unknown change the gate recorded at once, before anything is read", async () => {
        const { enter, e2eePort } = rig()
        e2eePort.historyKeyStanding.mockResolvedValue(UNKNOWN as never)
        const causes: string[] = []
        await enter(SESSION, "reset", { onEarlyCause: (cause) => causes.push(cause) })
        expect(causes).toEqual(["unknown-change"])
    })

    it("is ready all the same when whether it is in can't be read, said", async () => {
        const { enter, deps } = rig()
        vi.mocked(deps.checkAdmission).mockRejectedValue(new Error("down"))
        expect(await enter(SESSION, "new-device")).toEqual({ kind: "ready", read: null })
        expect(deps.warn).toHaveBeenCalledWith("reading whether this device is in", expect.any(Error))
    })

    it("a setup failing: signs in again on a session naming another device, else says what failed — the error kept", async () => {
        const mismatch = new IdpError(403, "device_mismatch", "x")
        const signing = rig({ setUp: vi.fn(async () => Promise.reject(mismatch)) } as Partial<EnterRestorePageDeps>)
        vi.mocked(signing.deps.signInAgainOnDeviceMismatch).mockResolvedValue(true)
        expect(await signing.enter(SESSION, "new-device")).toEqual({ kind: "signing-in-again", error: mismatch })

        const down = new Error("IdP down")
        const failing = rig({ setUp: vi.fn(async () => Promise.reject(down)) } as Partial<EnterRestorePageDeps>)
        expect(await failing.enter(SESSION, "new-device")).toEqual({ kind: "failed", error: down, message: "IdP down" })
    })

    it("stops once cancelled", async () => {
        let cancelled = false
        const { enter, deps } = rig()
        vi.mocked(deps.setUp).mockImplementation(async () => void (cancelled = true))
        expect(await enter(SESSION, "new-device", { cancelled: () => cancelled })).toEqual({ kind: "cancelled" })
        expect(deps.checkAdmission).not.toHaveBeenCalled()
    })
})
