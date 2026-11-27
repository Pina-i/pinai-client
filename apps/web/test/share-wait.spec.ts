import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import type { AwaitedShareState, ShareAcceptance } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { ShareWait, type Visibility } from "@pinai/domain/usecases/e2ee/share-wait.usecase"

function visibility(): Visibility & { set: (visible: boolean) => void } {
    let visible = true
    const listeners = new Set<() => void>()
    return {
        visible: () => visible,
        onChange: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        set: (next) => {
            visible = next
            listeners.forEach((listener) => listener())
        },
    }
}

function rig(accept: () => Promise<ShareAcceptance | null>) {
    const view = visibility()
    const states: AwaitedShareState["kind"][] = []
    const deps = {
        accept: vi.fn(accept),
        visibility: view,
        signInAgainOnDeviceMismatch: vi.fn(async () => false),
        warn: vi.fn(),
        onState: (state: AwaitedShareState) => states.push(state.kind),
        onKept: vi.fn(),
    }
    return { wait: new ShareWait(deps), deps, view, states }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("ShareWait", () => {
    it("reads the share at once, then again on its backoff while it waits, until the words are held", async () => {
        let reads = 0
        const { wait, deps, states } = rig(async () => (++reads === 3 ? { kind: "kept", generation: 1 } : null))
        wait.start()
        await vi.runAllTimersAsync()

        expect(deps.accept).toHaveBeenCalledTimes(3)
        expect(states).toEqual(["kept"])
        expect(deps.onKept).toHaveBeenCalledOnce()
    })

    it("reads nothing while the app isn't in front, and reads at once when it comes back", async () => {
        const { wait, deps, view } = rig(async () => null)
        view.set(false)
        wait.start()
        await vi.advanceTimersByTimeAsync(60_000)
        expect(deps.accept).not.toHaveBeenCalled()

        view.set(true)
        await vi.advanceTimersByTimeAsync(0)
        expect(deps.accept).toHaveBeenCalledOnce()
        wait.stop()
    })

    it("signs in again when the wait ends on a session naming another device; warns of any other end", async () => {
        const mismatch = rig(async () => Promise.reject(new IdpError(403, "device_mismatch", "x")))
        mismatch.deps.signInAgainOnDeviceMismatch.mockResolvedValue(true)
        mismatch.wait.start()
        await vi.runAllTimersAsync()
        expect(mismatch.states).toEqual(["ended"])
        expect(mismatch.deps.warn).not.toHaveBeenCalledWith("reading the history key share", expect.anything())

        const denied = rig(async () => Promise.reject(new IdpError(403, "access_denied", "x")))
        denied.wait.start()
        await vi.runAllTimersAsync()
        expect(denied.deps.warn).toHaveBeenCalledWith("reading the history key share", expect.any(IdpError))
    })

    it("reads nothing more once stopped", async () => {
        const { wait, deps } = rig(async () => null)
        wait.start()
        await vi.advanceTimersByTimeAsync(0)
        wait.stop()
        await vi.advanceTimersByTimeAsync(600_000)
        expect(deps.accept).toHaveBeenCalledOnce()
    })
})
