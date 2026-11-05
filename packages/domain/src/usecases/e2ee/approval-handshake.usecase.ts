import {
    ANSWER_TIMEOUT_MS,
    APPROVAL_REQUEST_LIFETIME_MS,
    POLL_BACKOFF_MS,
    RATE_LIMITED_RETRY_MS,
    STILL_WAITING_AFTER_MS,
    UNREACHABLE_RETRY_MS,
    HandshakeRefused,
    answerableRequests,
    closedMeans,
    endsTheWait,
    enterDelay,
    failureShown,
    isRefusedForGood,
    isTooManyRequests,
    mayAnswer,
    mayAsk,
    nextRequestAt,
    noteForNext,
    pollDelay,
    relayRefusal,
    renewsByItself,
    type ApprovalRequest,
    type HandshakeFailure,
    type HandshakeOutcome,
    type HandshakePhase,
    type HandshakeRole,
    type RelayMessage,
} from "../../models/approval-handshake"
import type { DeviceListEntry } from "../../models/device"
import { duplicateDeviceIds, type HandshakePartner } from "../../models/device-trust"
import type { ActorUri, DeviceId } from "../../models/e2ee"
import type { WsServerEvent } from "../../models/ws"
import type { IApprovalRelayPort } from "../../ports/approval-relay.port"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { ApprovalHandshakeSession, IE2eePort } from "../../ports/e2ee.port"

import type { CheckAdmissionDeps } from "./check-admission.usecase"
import { registerIdentityUseCase } from "./register-identity.usecase"
import { shareHistoryKeyUseCase, type ShareHistoryKeyDeps } from "./share-history-key.usecase"

export interface HandshakeDeps {
    e2ee: Pick<
        IE2eePort,
        | "newApprovalCode"
        | "startApprovalHandshake"
        | "checkHandshakePeer"
        | "signDeviceApproval"
        | "approvesThisDevice"
        | "rememberHandshakePartner"
        | "checkHistoryKey"
        | "getDeviceId"
    >
    relay: IApprovalRelayPort
    directory: Pick<IDeviceDirectoryPort, "listDevices" | "approveByDevice">
    /** Wired, the answerer shares the passphrase with the device it just approved (§ 3.11). */
    sharing?: ShareHistoryKeyDeps
}

export interface HandshakeContext {
    idpUrl: string
    /** Read at each call: a run outlives renewals. */
    accessToken: () => string | null
    actorUri: ActorUri
    now?: () => number
    /** Told what failed where the flow goes on without it; the domain logs nothing itself. */
    report?: (what: string, error: unknown) => void
}

/** The request a run takes part in, and the device asking it. */
export interface RunRequest {
    id: string
    askingDevice: DeviceId
}

/** Ambiguous failures of an approval are sent again this many times: the route answers `204` to a repeat. */
const APPROVAL_ATTEMPTS = 3

/**
 * One side of one exchange over the relay. A refused message ends the request and nothing else is
 * sent. The answerer approves the asker on its own say; the asker waits to see that approval in the
 * list, verified under the key the exchange gave, before approving back — so a refused asker
 * approves nobody. Each side keeps its partner before posting its approval, so an approval on the
 * server never lacks its partner here. Calls take turns.
 */
export class HandshakeRun {
    readonly role: HandshakeRole
    readonly request: RunRequest
    phase: HandshakePhase
    outcome: HandshakeOutcome | null = null
    /** Another device posted: someone may have spent a guess on this code. */
    answered = false
    /** When this side gives up, on its own clock — never the relay's `expires_at`, which it can shorten. */
    deadline: number

    private readonly deps: HandshakeDeps
    private readonly context: HandshakeContext
    private readonly thisDevice: DeviceId
    private session: ApprovalHandshakeSession | null
    private partner: HandshakePartner | null = null
    private kept = false
    private after = 0
    private lastToken: string | null = null
    private turn: Promise<void> = Promise.resolve()
    private readonly listeners = new Set<() => void>()

    constructor(input: {
        role: HandshakeRole
        deps: HandshakeDeps
        context: HandshakeContext
        request: RunRequest
        thisDevice: DeviceId
        deadline: number
    }) {
        this.role = input.role
        this.deps = input.deps
        this.context = input.context
        this.request = input.request
        this.thisDevice = input.thisDevice
        this.deadline = input.deadline
        this.session = null
        this.lastToken = input.context.accessToken()
        this.phase = input.role === "asker" ? "waiting" : "ready"
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /** The asker's session, once its share is out. */
    begin(session: ApprovalHandshakeSession): void {
        if (this.role === "asker" && !this.session && !this.outcome) this.session = session
        else session.close()
    }

    /** The answerer, once the code is typed: only a device acting on approval answers. */
    answer(code: string): Promise<void> {
        return this.inTurn(async () => {
            if (this.role !== "answerer" || this.phase !== "ready") return
            const standing = await this.deps.e2ee.checkHistoryKey(this.context.idpUrl, this.token())
            if (!mayAnswer(standing)) return this.settle({ kind: "failed", reason: "not-acting" })
            this.session = await this.deps.e2ee.startApprovalHandshake({
                role: "answerer",
                code,
                requestId: this.request.id,
                actorUri: this.context.actorUri,
                peerDeviceId: this.request.askingDevice,
            })
            this.deadline = this.now() + ANSWER_TIMEOUT_MS
            this.move("waiting")
            await this.step()
        })
    }

    /** The peer posted (`approval_message`): read and answer. */
    advance(): Promise<void> {
        return this.inTurn(() => this.step())
    }

    /** The request ended (`approval_closed`): what came with the close is read first. */
    closed(): Promise<void> {
        return this.inTurn(() => this.settleClosed())
    }

    /** Without pushes: the deadline first, before any call; then the relay; then whether the request is still open. */
    poll(): Promise<void> {
        return this.inTurn(async () => {
            if (this.now() >= this.deadline) return this.fail("expired")
            await this.step()
            if (this.outcome) return
            const open = await this.deps.relay.openRequests(this.context.idpUrl, this.token())
            if (!open.some((r) => r.id === this.request.id)) await this.settleClosed()
        })
    }

    /** The user gives up: the request ends — either side may close it. */
    cancel(): Promise<void> {
        return this.inTurn(() => this.fail("cancelled"))
    }

    /** This side leaves: the asker ends its request, and so does an answerer that already took part. */
    abandon(options?: { keepalive?: boolean }): Promise<void> {
        return this.inTurn(async () => {
            if (this.role === "asker" || this.phase !== "ready") await this.closeRequest(options)
            this.settle({ kind: "failed", reason: "ended" })
        })
    }

    private inTurn(work: () => Promise<void>): Promise<void> {
        const run = this.turn.then(() => (this.outcome ? undefined : work()))
        this.turn = run.catch(() => undefined)
        return run
    }

    private async step(): Promise<void> {
        if (this.outcome || this.phase === "ready") return
        if (this.phase === "approving") return this.role === "asker" ? this.checkApproved() : this.finishAnswer()
        if (!this.session) return
        let messages: RelayMessage[]
        try {
            messages = await this.deps.relay.read(this.context.idpUrl, this.token(), this.request.id, this.after)
        } catch (error) {
            const refusal = relayRefusal(error)
            if (refusal) return this.settle({ kind: "failed", reason: refusal })
            throw error
        }
        for (const message of [...messages].sort((a, b) => a.seq - b.seq)) {
            if (this.pastMessages()) return
            if (message.seq <= this.after) continue
            this.after = message.seq
            if (message.deviceId !== this.thisDevice) await this.take(message)
        }
    }

    // The approving phase reads the list, no more messages.
    private pastMessages(): boolean {
        return this.outcome !== null || this.phase === "approving"
    }

    private async take(message: RelayMessage): Promise<void> {
        if (this.role === "asker") this.answered = true
        let taken: ReturnType<ApprovalHandshakeSession["receive"]>
        try {
            taken = (this.session as ApprovalHandshakeSession).receive(message.body, message.deviceId)
        } catch (error) {
            if (error instanceof HandshakeRefused) return this.fail(error.reason)
            throw error
        }
        if (!taken.peerKeys) {
            if (taken.reply && (await this.send(taken.reply))) this.move(this.phase === "waiting" ? "confirming" : "exchanging")
            return
        }
        // The message is taken: a failure from here on can't wait for it to come again.
        const partner = { deviceId: message.deviceId, ...taken.peerKeys }
        try {
            if (!(await this.peerChecks(partner))) return
        } catch (error) {
            this.context.report?.("checking the peer's keys", error)
            return this.fail("error")
        }
        this.partner = partner
        if (this.role === "asker" && taken.reply && !(await this.send(taken.reply))) return
        this.move("approving")
        await this.step()
    }

    /** The peer's keys from the exchange against the list, read now; a refusal ends the request. */
    private async peerChecks(partner: HandshakePartner): Promise<boolean> {
        const { idpUrl, actorUri } = this.context
        const { devices } = await this.deps.directory.listDevices(idpUrl, this.token())
        const check = await this.deps.e2ee.checkHandshakePeer(actorUri, partner, devices)
        if (check.ok) return true
        await this.fail(check.reason === "unsettled" ? "error" : "keys-refused")
        return false
    }

    /** The answerer approves the asker over the root key the exchange gave, ends the request, then shares the passphrase. */
    private async finishAnswer(): Promise<void> {
        const partner = this.partner as HandshakePartner
        if (!(await this.approveBack(partner))) return
        await this.closeRequest()
        this.settle({ kind: "approved", partner })
        await this.share()
    }

    // The approval stands whatever happens here: each refresh of the device list shares again.
    private async share(): Promise<void> {
        const sharing = this.deps.sharing
        if (!sharing) return
        try {
            const { idpUrl, actorUri } = this.context
            const { failed } = await shareHistoryKeyUseCase(sharing)(idpUrl, this.token(), actorUri)
            for (const { error } of failed) this.context.report?.("sharing the history passphrase", error)
        } catch (error) {
            this.context.report?.("sharing the history passphrase", error)
        }
    }

    /** The asker: approved once the list shows the answerer's approval of it, under the answerer's key from the exchange. */
    private async checkApproved(): Promise<void> {
        const partner = this.partner
        if (!partner || this.outcome) return
        let devices: DeviceListEntry[]
        try {
            devices = (await this.deps.directory.listDevices(this.context.idpUrl, this.token())).devices
        } catch (error) {
            // Refused for good — a revoked device —, no later read does better.
            if (isRefusedForGood(error)) return this.fail("error")
            throw error
        }
        // § 3.9: a list naming an id twice decides nothing.
        if (duplicateDeviceIds(devices.map((d) => d.device_id)).length > 0) return
        const own = devices.find((d) => d.device_id === this.thisDevice)
        const byPartner = (own?.approvals ?? []).flatMap((a) => (a.by === "device" && a.device_id === partner.deviceId ? [a] : []))
        for (const approval of byPartner) {
            if (!(await this.deps.e2ee.approvesThisDevice(this.context.actorUri, partner.rootKey, approval.signature))) continue
            if (!(await this.approveBack(partner))) return
            await this.closeRequest()
            return this.settle({ kind: "approved", partner })
        }
    }

    /**
     * Kept first, then approved: the approval's route answers `204` to a repeat, so an ambiguous
     * failure is sent again; one refused for good ends the run. Otherwise it throws and the next
     * call tries again.
     */
    private async approveBack(partner: HandshakePartner): Promise<boolean> {
        const { idpUrl, actorUri } = this.context
        try {
            if (!this.kept) await this.deps.e2ee.rememberHandshakePartner(partner)
            this.kept = true
        } catch (error) {
            this.context.report?.("keeping the partner", error)
            await this.fail("error")
            return false
        }
        const signature = await this.deps.e2ee.signDeviceApproval(actorUri, partner.deviceId, partner.rootKey)
        for (let attempt = 1; ; attempt++) {
            try {
                await this.deps.directory.approveByDevice(idpUrl, this.token(), partner.deviceId, signature)
                return true
            } catch (error) {
                if (isRefusedForGood(error)) {
                    await this.fail("error")
                    return false
                }
                if (attempt >= APPROVAL_ATTEMPTS) throw error
            }
        }
    }

    private async settleClosed(): Promise<void> {
        await this.step()
        if (this.outcome) return
        if (this.phase === "approving" && this.role === "asker") await this.checkApproved()
        if (!this.outcome) this.settle({ kind: "failed", reason: closedMeans(this.role, this.phase) })
    }

    private async send(body: Uint8Array): Promise<boolean> {
        try {
            await this.deps.relay.post(this.context.idpUrl, this.token(), this.request.id, body)
            return true
        } catch (error) {
            const refusal = relayRefusal(error)
            this.context.report?.("posting to the relay", error)
            if (refusal) this.settle({ kind: "failed", reason: refusal })
            else await this.fail("error")
            return false
        }
    }

    /** This side ends the request, then says why. */
    private async fail(reason: HandshakeFailure): Promise<void> {
        await this.closeRequest()
        this.settle({ kind: "failed", reason })
    }

    private async closeRequest(options?: { keepalive?: boolean }): Promise<void> {
        try {
            await this.deps.relay.close(this.context.idpUrl, this.token(), this.request.id, options)
        } catch (error) {
            // Ended already, or out of reach: it expires on its own.
            if (relayRefusal(error) !== "ended") this.context.report?.("ending the request", error)
        }
    }

    private move(phase: HandshakePhase): void {
        this.phase = phase
        this.tell()
    }

    private settle(outcome: HandshakeOutcome): void {
        if (this.outcome) return
        this.outcome = outcome
        this.session?.close()
        this.session = null
        this.tell()
    }

    private tell(): void {
        for (const listener of this.listeners) listener()
    }

    // The last token held still ends the request after a sign-out cleared the store.
    private token(): string {
        const token = this.context.accessToken() ?? this.lastToken
        if (!token) throw new Error("Signed out")
        this.lastToken = token
        return token
    }

    private now(): number {
        return (this.context.now ?? Date.now)()
    }
}

/** The answering side of an open request, before the code is typed. */
export function answeringRun(
    deps: HandshakeDeps,
    context: HandshakeContext,
    request: ApprovalRequest,
    thisDevice: DeviceId,
): HandshakeRun {
    return new HandshakeRun({
        role: "answerer",
        deps,
        context,
        request: { id: request.id, askingDevice: request.deviceId },
        thisDevice,
        deadline: Infinity,
    })
}

/** What the asking page shows. */
export type AskingState =
    | { kind: "starting" }
    | {
          kind: "showing"
          code: string
          /** When the code goes, on this device's clock. */
          deadline: number
          phase: HandshakePhase
          answered: boolean
          /** Why the code before it went. */
          failure: HandshakeFailure | null
      }
    /** No request open: the page's budget, the relay's `429`, or the instance out of reach — tried again by itself. */
    | { kind: "waiting"; until: number; why: "limit" | "unreachable"; failure: HandshakeFailure | null }
    /** The last code went some other way than unanswered: a new one takes the user's say. */
    | { kind: "stopped"; failure: HandshakeFailure }
    /** Set aside by the page; the user brings it back. */
    | { kind: "paused" }
    | { kind: "approved"; partner: HandshakePartner }
    /** This device holds the current passphrase: it answers, it doesn't ask. */
    | { kind: "holds" }

/**
 * The asking device's side while its "Another device" section is on screen. A code nobody
 * answered is renewed when its 10 minutes run out on this device's clock; anything else — a wrong
 * code, a close, an answer then silence — waits for the user (`again`), so each guess the instance
 * makes costs the user an action. Ticks never overlap: the page schedules the next after
 * `nextDelay()`.
 */
export class ApprovalAsking {
    state: AskingState = { kind: "starting" }

    private readonly deps: HandshakeDeps
    private readonly context: HandshakeContext
    private readonly opened: number[]
    private run: HandshakeRun | null = null
    private code: string | null = null
    private openedAt = 0
    private nextAt = 0
    private waitWhy: "limit" | "unreachable" = "limit"
    private failure: HandshakeFailure | null = null
    private failuresInARow = 0
    private lastError: unknown = null
    private ticking: Promise<void> | null = null
    private stopped = false
    // Bumped by each `again` and `pause`: a pause waiting on a tick yields to an `again` made meanwhile.
    private asks = 0
    private readonly listeners = new Set<() => void>()

    /** `opened` — when this page load opened its requests: the budget outlives a remount. */
    constructor(deps: HandshakeDeps, context: HandshakeContext, opened: number[] = []) {
        this.deps = deps
        this.context = context
        this.opened = opened
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /** One at a time: a tick asked while one runs is that one. Throws what a read of the relay threw. */
    tick(): Promise<void> {
        this.ticking ??= this.step().finally(() => {
            this.ticking = null
        })
        return this.ticking
    }

    /** Before the next tick. */
    nextDelay(): number {
        if (this.run && !this.run.outcome) return pollDelay(this.failuresInARow, this.lastError)
        if (this.state.kind === "waiting") return Math.max(POLL_BACKOFF_MS[0], this.nextAt - this.now())
        return POLL_BACKOFF_MS[0]
    }

    /** The user asks for a code: after one went, or once the page set the section aside. */
    again(): Promise<void> {
        this.asks += 1
        if (this.state.kind === "stopped" || this.state.kind === "paused") this.set({ kind: "starting" })
        return this.tick()
    }

    /**
     * The page sets the section aside: a request nobody answered ends. One another device answered
     * goes on — its exchange, or the approval it is making, isn't the user's to drop by looking away.
     */
    async pause(): Promise<void> {
        if (this.state.kind === "approved" || this.state.kind === "holds") return
        const asked = ++this.asks
        await this.ticking?.catch(() => undefined)
        if (asked !== this.asks || this.run?.answered) return
        const run = this.run
        this.run = null
        this.code = null
        this.set({ kind: "paused" })
        await run?.abandon()
    }

    /** The section goes: the request open ends, `keepalive` when the page itself goes. */
    async stop(options?: { keepalive?: boolean }): Promise<void> {
        this.stopped = true
        const run = this.run
        this.run = null
        this.code = null
        await run?.abandon(options)
    }

    private async step(): Promise<void> {
        if (this.stopped || !["starting", "showing", "waiting"].includes(this.state.kind)) return
        const run = this.run
        if (run) {
            if (!run.outcome) {
                try {
                    await run.poll()
                    this.failuresInARow = 0
                } catch (error) {
                    this.failuresInARow += 1
                    this.lastError = error
                    if (!run.outcome) {
                        this.show(run)
                        throw error
                    }
                }
            }
            if (this.run !== run) return
            if (!run.outcome) return this.show(run)
            this.run = null
            this.code = null
            if (run.outcome.kind === "approved") return this.set({ kind: "approved", partner: run.outcome.partner })
            const reason = run.outcome.reason
            this.failure = reason
            if (!renewsByItself({ reason, answered: run.answered, openedAt: this.openedAt, now: this.now() })) {
                return this.set({ kind: "stopped", failure: reason })
            }
        } else if (this.state.kind === "waiting" && this.now() < this.nextAt) {
            return
        }
        await this.open()
    }

    private async open(): Promise<void> {
        const { idpUrl, actorUri } = this.context
        const token = this.context.accessToken()
        if (!token) return
        try {
            const standing = await this.deps.e2ee.checkHistoryKey(idpUrl, token)
            if (this.stopped) return
            if (!mayAsk(standing)) return this.set({ kind: "holds" })
        } catch (error) {
            this.context.report?.("reading the history key", error)
            return this.wait("unreachable", this.now() + UNREACHABLE_RETRY_MS)
        }
        const allowedAt = nextRequestAt(this.opened, this.now())
        if (allowedAt > this.now()) return this.wait("limit", allowedAt)
        let request: { id: string; expiresAt: string }
        try {
            request = await this.deps.relay.openRequest(idpUrl, token)
        } catch (error) {
            this.context.report?.("opening a request", error)
            const limited = isTooManyRequests(error)
            return this.wait(limited ? "limit" : "unreachable", this.now() + (limited ? RATE_LIMITED_RETRY_MS : UNREACHABLE_RETRY_MS))
        }
        this.openedAt = this.now()
        this.opened.push(this.openedAt)
        const thisDevice = await this.deps.e2ee.getDeviceId()
        const run = new HandshakeRun({
            role: "asker",
            deps: this.deps,
            context: this.context,
            request: { id: request.id, askingDevice: thisDevice },
            thisDevice,
            deadline: this.openedAt + APPROVAL_REQUEST_LIFETIME_MS,
        })
        // Left meanwhile: what was just opened is ended at once.
        if (this.stopped) return run.abandon()
        const code = this.deps.e2ee.newApprovalCode()
        try {
            const session = await this.deps.e2ee.startApprovalHandshake({
                role: "asker",
                code,
                requestId: request.id,
                actorUri,
                peerDeviceId: null,
            })
            await this.deps.relay.post(idpUrl, token, request.id, session.opening() as Uint8Array)
            run.begin(session)
        } catch (error) {
            this.context.report?.("starting the exchange", error)
            // Nobody saw this code: asking again needs no say of the user's.
            await run.abandon()
            return this.wait("unreachable", this.now() + UNREACHABLE_RETRY_MS)
        }
        if (this.stopped || this.state.kind === "paused") return run.abandon()
        this.run = run
        this.code = code
        run.onChange(() => {
            if (this.run === run && !run.outcome) this.show(run)
        })
        this.show(run)
    }

    private show(run: HandshakeRun): void {
        this.set({
            kind: "showing",
            code: this.code as string,
            deadline: run.deadline,
            phase: run.phase,
            answered: run.answered,
            failure: this.failure,
        })
    }

    private wait(why: "limit" | "unreachable", until: number): void {
        this.waitWhy = why
        this.nextAt = until
        this.set({ kind: "waiting", until: this.nextAt, why: this.waitWhy, failure: this.failure })
    }

    private set(state: AskingState): void {
        this.state = state
        for (const listener of this.listeners) listener()
    }

    private now(): number {
        return (this.context.now ?? Date.now)()
    }
}

/** Approved, then: `waiting` once the approving device is slow to show at the current generation; `refused` by `endsTheWait`. */
export type EnteringState =
    | { kind: "entering"; waiting: boolean }
    | { kind: "in" }
    | { kind: "refused"; error: unknown }

/**
 * The asking device once approved: its KeyPackages go out as soon as it is in
 * (`registerIdentityUseCase`), asked again with a backoff (`nextDelay`) until then. Only
 * `endsTheWait` ends it. Ticks never overlap.
 */
export class ApprovedEntry {
    state: EnteringState = { kind: "entering", waiting: false }

    private readonly deps: CheckAdmissionDeps
    private readonly context: Pick<HandshakeContext, "idpUrl" | "accessToken" | "actorUri" | "now" | "report">
    private readonly since: number
    private attempts = 0
    private ticking: Promise<void> | null = null
    private readonly listeners = new Set<() => void>()

    constructor(deps: CheckAdmissionDeps, context: Pick<HandshakeContext, "idpUrl" | "accessToken" | "actorUri" | "now" | "report">) {
        this.deps = deps
        this.context = context
        this.since = this.now()
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    tick(): Promise<void> {
        this.ticking ??= this.step().finally(() => {
            this.ticking = null
        })
        return this.ticking
    }

    nextDelay(): number {
        return enterDelay(Math.max(0, this.attempts - 1))
    }

    private async step(): Promise<void> {
        if (this.state.kind !== "entering") return
        const accessToken = this.context.accessToken()
        if (!accessToken) return
        try {
            const { idpUrl, actorUri } = this.context
            const admission = await registerIdentityUseCase(this.deps)({ idpUrl, accessToken, actorUri })
            if (admission.kind === "in") return this.set({ kind: "in" })
        } catch (error) {
            if (endsTheWait(error)) return this.set({ kind: "refused", error })
            this.context.report?.("letting this device in", error)
        }
        this.attempts += 1
        this.set({ kind: "entering", waiting: this.now() - this.since >= STILL_WAITING_AFTER_MS })
    }

    private set(state: EnteringState): void {
        this.state = state
        for (const listener of this.listeners) listener()
    }

    private now(): number {
        return (this.context.now ?? Date.now)()
    }
}

/** What the Door shows. `entry`: the code to type; `working`: the exchange under way. */
export interface AnsweringView {
    request: ApprovalRequest
    stage: "entry" | "working" | "approved" | "failed"
    failure: HandshakeFailure | null
    /** The device's last request failed so: its new one is this. */
    note: HandshakeFailure | null
    /** A code refused before any exchange: one tried already, or another tab answering this request. */
    refused: "used-code" | "other-tab" | null
}

export type ApprovalPush = Extract<WsServerEvent, { type: "approval_requested" | "approval_message" | "approval_closed" }>

/** Held while this tab answers a request; `null` when another tab holds it. */
export type AnswerLock = (requestId: string) => Promise<(() => void) | null>

function stageOf(run: HandshakeRun): AnsweringView["stage"] {
    if (!run.outcome) return run.phase === "ready" ? "entry" : "working"
    return run.outcome.kind === "approved" ? "approved" : "failed"
}

// Read through a call: the checker keeps a narrowing of `outcome` across an await.
function notActing(run: HandshakeRun): boolean {
    return run.outcome?.kind === "failed" && run.outcome.reason === "not-acting"
}

function shows(run: HandshakeRun): boolean {
    return run.outcome?.kind === "failed" && failureShown(run.outcome.reason, run.phase)
}

/**
 * The Door's side on a device acting on approval: one of another device's open, unanswered
 * requests at a time, read on `refresh` and kept current by the relay's pushes. Its own run stays
 * shown whatever the list says. A code tried once is never tried again (`usedCodes`), one tab
 * answers a request (`lock`), and closing the prompt before answering leaves the request alone.
 */
export class ApprovalAnswering {
    private view: AnsweringView | null = null
    private requests: ApprovalRequest[] = []
    private acting = false
    private thisDevice: DeviceId | null = null
    private refreshes = 0
    private readonly dismissed = new Set<string>()
    private shown: { request: ApprovalRequest; run: HandshakeRun; note: HandshakeFailure | null } | null = null
    private refused: AnsweringView["refused"] = null
    private release: (() => void) | null = null
    private readonly listeners = new Set<() => void>()
    private readonly deps: HandshakeDeps
    private readonly context: HandshakeContext
    private readonly usedCodes: Set<string>
    private readonly lock: AnswerLock | null

    constructor(deps: HandshakeDeps, context: HandshakeContext, options: { usedCodes?: Set<string>; lock?: AnswerLock } = {}) {
        this.deps = deps
        this.context = context
        this.usedCodes = options.usedCodes ?? new Set()
        this.lock = options.lock ?? null
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    snapshot = (): AnsweringView | null => this.view

    /** The open requests read again; whether this device acts asked when another device's waits. An older read's answer is dropped. */
    async refresh(): Promise<void> {
        const token = this.context.accessToken()
        if (!token) return
        const seq = ++this.refreshes
        const [requests, thisDevice] = await Promise.all([
            this.deps.relay.openRequests(this.context.idpUrl, token),
            this.deps.e2ee.getDeviceId(),
        ])
        let acting = this.acting
        if (requests.some((r) => r.deviceId !== thisDevice && r.approverDeviceId === null)) {
            acting = mayAnswer(await this.deps.e2ee.checkHistoryKey(this.context.idpUrl, token))
        }
        if (seq !== this.refreshes) return
        this.thisDevice = thisDevice
        this.acting = acting
        this.requests = requests
        this.pick()
    }

    onPush(push: ApprovalPush): Promise<void> {
        const id = push.data.request_id
        const run = this.shown?.request.id === id ? this.shown.run : null
        if (push.type === "approval_requested") return this.refresh()
        if (push.type === "approval_message") return run?.advance() ?? Promise.resolve()
        this.requests = this.requests.filter((r) => r.id !== id)
        if (run) return run.closed()
        this.pick()
        return Promise.resolve()
    }

    async answer(code: string): Promise<void> {
        const run = this.shown?.run
        if (!run || run.phase !== "ready" || run.outcome) return
        if (this.usedCodes.has(code)) return this.refuse("used-code")
        if (this.lock && !this.release) {
            const release = await this.lock(run.request.id)
            if (!release) return this.refuse("other-tab")
            this.release = release
        }
        this.refused = null
        await run.answer(code)
        if (!notActing(run)) this.usedCodes.add(code)
    }

    poll(): Promise<void> {
        const run = this.shown?.run
        return run && this.view?.stage === "working" ? run.poll() : Promise.resolve()
    }

    /** The user gives the exchange up: the request ends. */
    cancel(): Promise<void> {
        return this.shown?.run.cancel() ?? Promise.resolve()
    }

    /** The prompt closed: that request is set aside here — ended only if this device already took part. */
    async dismiss(): Promise<void> {
        const shown = this.shown
        if (shown) this.dismissed.add(shown.request.id)
        this.shown = null
        this.refused = null
        this.pick()
        if (shown && !shown.run.outcome) await shown.run.abandon()
        this.freeLock()
    }

    private refuse(why: "used-code" | "other-tab"): void {
        this.refused = why
        this.show()
    }

    private pick(): void {
        const thisDevice = this.thisDevice
        if (!thisDevice) return this.show()
        const open = answerableRequests(this.requests, { thisDevice, acting: this.acting, dismissed: this.dismissed })
        const shown = this.shown
        if (shown) {
            const { run, request } = shown
            const stage = stageOf(run)
            if (stage === "working" || stage === "approved") return this.show()
            if (stage === "entry" && open.some((r) => r.id === request.id)) return this.show()
            if (stage === "failed") {
                const again = open.find((r) => r.deviceId === request.deviceId && r.id !== request.id)
                const reason = run.outcome?.kind === "failed" ? run.outcome.reason : null
                if (again) return this.start(again, reason ? noteForNext(reason) : null)
                if (shows(run)) return this.show()
            }
        }
        const next = open.find((r) => r.id !== shown?.request.id)
        if (next) return this.start(next, null)
        this.shown = null
        this.show()
    }

    private start(request: ApprovalRequest, note: HandshakeFailure | null): void {
        const run = answeringRun(this.deps, this.context, request, this.thisDevice as DeviceId)
        const shown = { request, run, note }
        this.shown = shown
        this.refused = null
        run.onChange(() => {
            if (this.shown !== shown) return
            const outcome = run.outcome
            if (outcome) this.freeLock()
            if (outcome?.kind === "failed" && outcome.reason === "not-acting") this.acting = false
            if (outcome?.kind === "failed" && outcome.reason === "taken") this.requests = this.requests.filter((r) => r.id !== request.id)
            if (outcome && !shows(run) && outcome.kind === "failed") return this.pick()
            this.show()
        })
        this.show()
    }

    private freeLock(): void {
        this.release?.()
        this.release = null
    }

    private show(): void {
        const shown = this.shown
        this.view = shown
            ? {
                  request: shown.request,
                  stage: stageOf(shown.run),
                  failure: shown.run.outcome?.kind === "failed" ? shown.run.outcome.reason : null,
                  note: shown.note,
                  refused: this.refused,
              }
            : null
        for (const listener of this.listeners) listener()
    }
}
