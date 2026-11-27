import { POLL_BACKOFF_MS, pollDelay, type DoorSummons } from "../../models/approval-handshake"
import type { ApprovalAnswering } from "./approval-handshake.usecase"

/** Pushes reach live sessions only: while the Door waits for a device's code, the list is read again too. */
export const SUMMONS_REFRESH_MS = 10_000

export type AnsweringSide = Pick<ApprovalAnswering, "subscribe" | "snapshot" | "seats" | "summons" | "refresh" | "poll" | "dismiss">

/**
 * Keeps an `ApprovalAnswering` current, each platform giving only its timers: the first read, tried again on
 * `POLL_BACKOFF_MS`; a read when the socket comes back; every `SUMMONS_REFRESH_MS` while summoned; a chained poll
 * on `pollDelay` while an exchange works, the Door's or a seat's.
 */
export class AnsweringRuntime {
    private live = false
    private retry: ReturnType<typeof setTimeout> | undefined
    private summoned: DoorSummons | null = null
    private summonsTimer: ReturnType<typeof setInterval> | undefined
    private polling = false
    private pollTimer: ReturnType<typeof setTimeout> | undefined
    private unsubscribe: (() => void) | null = null
    private readonly answering: AnsweringSide
    private readonly warn: (what: string, error: unknown) => void

    constructor(answering: AnsweringSide, warn: (what: string, error: unknown) => void) {
        this.answering = answering
        this.warn = warn
    }

    /** `ready` once the first read settled, read or not: the screens show the answering side from then on. */
    start(ready: () => void): void {
        this.live = true
        this.unsubscribe = this.answering.subscribe(() => this.follow())
        this.firstRead(0, ready)
        this.follow()
    }

    /** A socket that was down missed pushes. */
    reconnected(): void {
        if (this.live) this.refresh()
    }

    /** Its timers stopped, the request the Door showed left alone. */
    stop(): Promise<void> {
        this.live = false
        clearTimeout(this.retry)
        this.setSummoned(null)
        this.setPolling(false)
        this.unsubscribe?.()
        this.unsubscribe = null
        return this.answering.dismiss()
    }

    private refresh(): void {
        this.answering.refresh().catch((e: unknown) => this.warn("reading the approval requests", e))
    }

    private firstRead(failures: number, ready: () => void): void {
        this.answering.refresh().then(
            () => {
                if (this.live) ready()
            },
            (e: unknown) => {
                this.warn("reading the approval requests", e)
                if (!this.live) return
                ready()
                this.retry = setTimeout(() => this.firstRead(failures + 1, ready), POLL_BACKOFF_MS[Math.min(failures + 1, POLL_BACKOFF_MS.length - 1)])
            },
        )
    }

    private follow(): void {
        if (!this.live) return
        this.setSummoned(this.answering.summons())
        this.setPolling(this.answering.snapshot()?.stage === "working" || this.answering.seats().seat?.stage === "working")
    }

    private setSummoned(summons: DoorSummons | null): void {
        if (summons === this.summoned) return
        this.summoned = summons
        clearInterval(this.summonsTimer)
        this.summonsTimer = summons ? setInterval(() => this.refresh(), SUMMONS_REFRESH_MS) : undefined
    }

    private setPolling(working: boolean): void {
        if (working === this.polling) return
        this.polling = working
        clearTimeout(this.pollTimer)
        if (working) this.nextPoll(0, null)
    }

    private nextPoll(failures: number, lastError: unknown): void {
        this.pollTimer = setTimeout(() => {
            this.answering.poll().then(
                () => {
                    if (this.polling) this.nextPoll(0, null)
                },
                (e: unknown) => {
                    this.warn("reading the exchange", e)
                    if (this.polling) this.nextPoll(failures + 1, e)
                },
            )
        }, pollDelay(failures, lastError))
    }
}
