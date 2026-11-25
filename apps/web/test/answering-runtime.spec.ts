/**
 * What keeps the answering side current, for every client: the first read and its backoff, a read when the
 * socket comes back, the reads while the Door waits for a summoned device, the poll while an exchange works.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POLL_BACKOFF_MS, type AnsweringView, type DoorSummons, type SeatsView } from "@pinai/domain/models/approval-handshake"
import { AnsweringRuntime, SUMMONS_REFRESH_MS, type AnsweringSide } from "@pinai/domain/usecases/e2ee/answering-runtime.usecase"

function fakeSide() {
    const listeners = new Set<() => void>()
    let view: AnsweringView | null = null
    let summons: DoorSummons | null = null
    let seats: SeatsView = { open: [], atDoor: null, seat: null, busy: false, unsettled: false }
    const side = {
        subscribe: (listener: () => void) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        snapshot: () => view,
        seats: () => seats,
        summons: () => summons,
        refresh: vi.fn(async () => undefined),
        poll: vi.fn(async () => undefined),
        dismiss: vi.fn(async () => undefined),
    } satisfies AnsweringSide
    const tell = () => listeners.forEach((listener) => listener())
    return {
        side,
        setView: (next: AnsweringView | null) => {
            view = next
            tell()
        },
        setSeat: (next: AnsweringView | null) => {
            seats = { ...seats, seat: next }
            tell()
        },
        setSummons: (next: DoorSummons | null) => {
            summons = next
            tell()
        },
    }
}

const working = { request: { id: "r1" }, stage: "working", failure: null, note: null, refused: null } as unknown as AnsweringView
const quiet = () => undefined

describe("AnsweringRuntime", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("reads the requests as it starts, ready once read", async () => {
        const { side } = fakeSide()
        const ready = vi.fn()
        new AnsweringRuntime(side, quiet).start(ready)
        await vi.advanceTimersByTimeAsync(0)

        expect(side.refresh).toHaveBeenCalledTimes(1)
        expect(ready).toHaveBeenCalledTimes(1)
    })

    it("tries a failed first read again on the backoff, ready meanwhile", async () => {
        const { side } = fakeSide()
        side.refresh.mockRejectedValueOnce(new Error("down"))
        const ready = vi.fn()
        const warn = vi.fn()
        new AnsweringRuntime(side, warn).start(ready)
        await vi.advanceTimersByTimeAsync(0)

        expect(ready).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith("reading the approval requests", expect.any(Error))
        await vi.advanceTimersByTimeAsync(POLL_BACKOFF_MS[1] - 1)
        expect(side.refresh).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(side.refresh).toHaveBeenCalledTimes(2)
        expect(ready).toHaveBeenCalledTimes(2)
    })

    it("reads again every SUMMONS_REFRESH_MS while summoned, and stops after", async () => {
        const { side, setSummons } = fakeSide()
        new AnsweringRuntime(side, quiet).start(quiet)
        await vi.advanceTimersByTimeAsync(0)
        setSummons({ deviceId: "d2", displayName: "Pixel 8" })
        await vi.advanceTimersByTimeAsync(SUMMONS_REFRESH_MS * 2)

        expect(side.refresh).toHaveBeenCalledTimes(3)
        setSummons(null)
        await vi.advanceTimersByTimeAsync(SUMMONS_REFRESH_MS * 2)
        expect(side.refresh).toHaveBeenCalledTimes(3)
    })

    it("polls while the Door's exchange or a seat's works, and stops once it settled", async () => {
        const { side, setView, setSeat } = fakeSide()
        new AnsweringRuntime(side, quiet).start(quiet)
        await vi.advanceTimersByTimeAsync(0)
        setView(working)
        await vi.advanceTimersByTimeAsync(POLL_BACKOFF_MS[0] * 2)

        expect(side.poll).toHaveBeenCalledTimes(2)
        setView(null)
        await vi.advanceTimersByTimeAsync(POLL_BACKOFF_MS[3] * 2)
        expect(side.poll).toHaveBeenCalledTimes(2)
        setSeat(working)
        await vi.advanceTimersByTimeAsync(POLL_BACKOFF_MS[0])
        expect(side.poll).toHaveBeenCalledTimes(3)
    })

    it("backs off a poll that failed", async () => {
        const { side, setView } = fakeSide()
        side.poll.mockRejectedValueOnce(new Error("down"))
        new AnsweringRuntime(side, quiet).start(quiet)
        await vi.advanceTimersByTimeAsync(0)
        setView(working)
        await vi.advanceTimersByTimeAsync(POLL_BACKOFF_MS[0])

        expect(side.poll).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(POLL_BACKOFF_MS[1] - 1)
        expect(side.poll).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(side.poll).toHaveBeenCalledTimes(2)
    })

    it("reads again when the socket comes back, and nothing once stopped", async () => {
        const { side, setSummons } = fakeSide()
        const runtime = new AnsweringRuntime(side, quiet)
        runtime.start(quiet)
        await vi.advanceTimersByTimeAsync(0)
        runtime.reconnected()

        expect(side.refresh).toHaveBeenCalledTimes(2)
        await runtime.stop()
        expect(side.dismiss).toHaveBeenCalledTimes(1)
        runtime.reconnected()
        setSummons({ deviceId: "d2", displayName: "Pixel 8" })
        await vi.advanceTimersByTimeAsync(SUMMONS_REFRESH_MS * 2)
        expect(side.refresh).toHaveBeenCalledTimes(2)
    })
})
