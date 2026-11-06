/**
 * A start over asked from a device the account's devices haven't approved
 * (`identity-provider/specs/e2ee.md § 3.12`): every approved device is told and may cancel it, it
 * matures once no approved device has been used for 7 days, and an approval of the asking device
 * ends it.
 */

import type { DeviceId } from "./e2ee"
import {
    ALREADY_APPROVED,
    APPROVAL_REQUIRED,
    IdpError,
    NO_HISTORY_KEY,
    START_OVER_NOT_READY,
    START_OVER_PENDING,
    START_OVER_REQUIRED,
} from "./idp-error"

/** How a request ended. */
export type StartOverEnd = "cancelled" | "withdrawn" | "used" | "superseded" | "revoked" | "approved"

export const START_OVER_ENDS: readonly StartOverEnd[] = ["cancelled", "withdrawn", "used", "superseded", "revoked", "approved"]

export interface StartOverRequest {
    id: string
    /** The device asking. */
    deviceId: DeviceId
    /** The device asking, as the instance names it ("Chrome on Windows"); empty when it didn't say. */
    displayName: string
    /** Epoch ms, on the IdP's clock. */
    createdAt: number
    /** When it matures, as of the read: it moves each time an approved device is used. */
    readyAt: number
    /** `null` while open; the asker reads how its latest one ended for a week after. */
    ended: { reason: StartOverEnd; at: number } | null
}

/**
 * What `GET /api/history/start-over` gave: nothing to read, a request, or — for a device not
 * approved — another device's open request it may not read (`403 approval_required`).
 */
export type StartOverRead = { kind: "none" } | { kind: "request"; request: StartOverRequest } | { kind: "elsewhere" }

/**
 * The date moves only when an approved device is used — a sign-in, or a token renewed about every
 * 48 minutes —, so reading it again every 5 minutes, and when the page comes back, keeps it current
 * without asking the instance for more.
 */
export const START_OVER_REREAD_MS = 5 * 60_000

/**
 * Matured: past its `readyAt` on this device's clock, or ready from the start — no approved device
 * to wait for —, whatever this device's clock says. The IdP decides: a `PUT` too early is refused
 * with the date it holds.
 */
export function startOverReady(request: Pick<StartOverRequest, "createdAt" | "readyAt">, now: number): boolean {
    return request.readyAt <= request.createdAt || request.readyAt <= now
}

/** Where a device not approved stands with its own start over, as the asking screen shows it. */
export type AskingState =
    /** Nothing open: the warning and "Erase and start over", which asks. */
    | { kind: "choice" }
    /** Its request waits for the approved devices to go unused for 7 days. */
    | { kind: "waiting"; request: StartOverRequest }
    /** Matured: "Finish starting over". */
    | { kind: "ready"; request: StartOverRequest }
    /** One of the user's approved devices cancelled it: said, and it may ask again. */
    | { kind: "cancelled"; request: StartOverRequest }
    /** An approved device set new words, which ended it: where the device goes is the gate's. */
    | { kind: "superseded"; request: StartOverRequest }
    /** Another device approved this one meanwhile: it goes on as an approved device. */
    | { kind: "approved"; request: StartOverRequest }
    /** Another device's request is open: only one at a time, so this one can't ask. */
    | { kind: "elsewhere" }

/** Withdrawn, used or revoked, a request ended has nothing left to say: the choice, as if none. */
export function askingState(read: StartOverRead, thisDevice: DeviceId, now: number): AskingState {
    if (read.kind === "none") return { kind: "choice" }
    if (read.kind === "elsewhere") return { kind: "elsewhere" }
    const { request } = read
    if (request.deviceId !== thisDevice) return request.ended ? { kind: "choice" } : { kind: "elsewhere" }
    if (!request.ended) return startOverReady(request, now) ? { kind: "ready", request } : { kind: "waiting", request }
    switch (request.ended.reason) {
        case "cancelled":
        case "superseded":
        case "approved":
            return { kind: request.ended.reason, request }
        case "withdrawn":
        case "used":
        case "revoked":
            return { kind: "choice" }
    }
}

/**
 * The request a device is prompted about: open, and asked by another device. The IdP shows one
 * only to the devices approved under its generation — those it lets cancel —, so its answer decides.
 */
export function requestToPrompt(read: StartOverRead, thisDevice: DeviceId): StartOverRequest | null {
    if (read.kind !== "request") return null
    const { request } = read
    return request.ended === null && request.deviceId !== thisDevice ? request : null
}

/**
 * "Not now" puts a request off for this page load: the prompt comes back at the next load, and with
 * a new push for it.
 */
export function promptShown(request: StartOverRequest | null, putOff: ReadonlySet<string>): StartOverRequest | null {
    return request && !putOff.has(request.id) ? request : null
}

/** Why asking went otherwise: no request needed (it sets the generation itself), another's open, three today. */
export type AskRefusal = "not-needed" | "elsewhere" | "too-many"

export function askRefusal(error: unknown): AskRefusal | null {
    if (!(error instanceof IdpError)) return null
    if (error.code === ALREADY_APPROVED || error.code === NO_HISTORY_KEY) return "not-needed"
    if (error.code === START_OVER_PENDING) return "elsewhere"
    return error.status === 429 ? "too-many" : null
}

/** A next generation refused to a device not approved: its request not matured (when it will, `null` unsaid), or none open. */
export type FinishRefusal = { kind: "not-ready"; readyAt: number | null } | { kind: "request-required" }

export function finishRefusal(error: unknown): FinishRefusal | null {
    if (!(error instanceof IdpError)) return null
    if (error.code === START_OVER_NOT_READY) return { kind: "not-ready", readyAt: error.readyAt }
    return error.code === START_OVER_REQUIRED ? { kind: "request-required" } : null
}

/** Another device's open request, which this device may not read. */
export function readsElsewhere(error: unknown): boolean {
    return error instanceof IdpError && error.code === APPROVAL_REQUIRED
}

/** Ending a request that ended already, or is gone. */
export function endedAlready(error: unknown): boolean {
    return error instanceof IdpError && (error.status === 410 || error.status === 404)
}

/**
 * A finish the IdP refused as too early (`start_over_not_ready`): the date it holds, and when this
 * device may try again on its own clock — that date plus how far its clock runs ahead.
 */
export interface FinishHold {
    requestId: string
    readyAt: number
    until: number
}

/**
 * `clockLead`: how far this device's clock runs ahead of the IdP's, as the access token shows it.
 * Unknown, the refusal only proves a lower bound, so one reread passes before a press goes again.
 */
export function holdAfterRefusal(requestId: string, readyAt: number, refusedAt: number, clockLead: number | null): FinishHold {
    const until = clockLead === null ? Math.max(readyAt, refusedAt) + START_OVER_REREAD_MS : readyAt + Math.max(0, clockLead)
    return { requestId, readyAt, until }
}

/** The request the last refusal answered, its date unmoved, before the hold ends: no press can do better. */
export function heldBack(request: Pick<StartOverRequest, "id" | "readyAt">, hold: FinishHold | null, now: number): boolean {
    return hold !== null && request.id === hold.requestId && request.readyAt === hold.readyAt && now < hold.until
}
