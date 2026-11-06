/**
 * Start over requests (`identity-provider/specs/e2ee.md § 3.12`): where the asking device stands from
 * what `GET /api/history/start-over` says — waiting, matured, every way it ends —, which request an
 * approved device is prompted about, the routes as the client calls them, and the flows over an IdP
 * keeping the rule: a device not approved sets the next generation only through its own matured
 * request.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { SessionApiAdapter } from "@pinai/api/session/session-api.adapter"
import { HistoryArchiveApiAdapter } from "@pinai/api/e2ee/history-archive-api.adapter"
import { StartOverApiAdapter } from "@pinai/api/e2ee/start-over-api.adapter"
import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import { approvedHere, mayTurnOnSecondFactor, type Admission } from "@pinai/domain/models/admission"
import { revokeWithheld } from "@pinai/domain/models/device-roster"
import { IdpError, isApprovalRequired, isDeviceProofInvalid } from "@pinai/domain/models/idp-error"
import { passwordChange } from "@pinai/domain/models/instance-admin"
import { clockLeadOf } from "@pinai/domain/models/auth"
import {
    START_OVER_REREAD_MS,
    askRefusal,
    askingState,
    endedAlready,
    finishRefusal,
    heldBack,
    holdAfterRefusal,
    promptShown,
    readsElsewhere,
    requestToPrompt,
    startOverReady,
    type StartOverEnd,
    type StartOverRead,
    type StartOverRequest,
} from "@pinai/domain/models/start-over"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import {
    askToStartOverUseCase,
    endStartOverUseCase,
    readStartOverUseCase,
    startOverToPromptUseCase,
} from "@pinai/domain/usecases/e2ee/start-over-request.usecase"
import { startOverUseCase } from "@pinai/domain/usecases/e2ee/start-over.usecase"
import { mayTurnOnSecondFactorUseCase } from "@pinai/domain/usecases/e2ee/second-factor-approval.usecase"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { IStartOverPort } from "@pinai/domain/ports/start-over.port"

import { accessToken } from "./setup/access-token"
import { ACTOR, FakeHistoryIdp, IDP, historyDevice, nameSession } from "./setup/history-idp"

const ME = "550e8400-e29b-41d4-a716-446655440000"
const THEM = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 9, 10, 0)

function request(change: Partial<StartOverRequest> = {}): StartOverRequest {
    return { id: "r1", deviceId: ME, displayName: "Chrome on Windows", createdAt: NOW - DAY, readyAt: NOW + 6 * DAY, ended: null, ...change }
}

const read = (r: StartOverRequest): StartOverRead => ({ kind: "request", request: r })

describe("where the asking device stands", () => {
    it("chooses with nothing asked, and is told when another device's request is open", () => {
        expect(askingState({ kind: "none" }, ME, NOW)).toEqual({ kind: "choice" })
        expect(askingState({ kind: "elsewhere" }, ME, NOW)).toEqual({ kind: "elsewhere" })
        expect(askingState(read(request({ deviceId: THEM })), ME, NOW)).toEqual({ kind: "elsewhere" })
        expect(askingState(read(request({ deviceId: THEM, ended: { reason: "cancelled", at: NOW } })), ME, NOW)).toEqual({ kind: "choice" })
    })

    it("waits until its ready_at, and may finish from then on", () => {
        const open = request()
        expect(askingState(read(open), ME, NOW)).toEqual({ kind: "waiting", request: open })
        expect(askingState(read(open), ME, open.readyAt)).toEqual({ kind: "ready", request: open })
        expect(askingState(read(open), ME, open.readyAt + 1)).toEqual({ kind: "ready", request: open })
    })

    it("is ready at once when no device was approved to wait for, whatever this device's clock says", () => {
        const atOnce = request({ createdAt: NOW + 60_000, readyAt: NOW + 60_000 })
        expect(startOverReady(atOnce, NOW)).toBe(true)
        expect(askingState(read(atOnce), ME, NOW)).toEqual({ kind: "ready", request: atOnce })
    })

    it("says how its request ended: a cancel, an approval, new words; anything else is the choice again", () => {
        const ended = (reason: StartOverEnd) => request({ ended: { reason, at: NOW } })
        expect(askingState(read(ended("cancelled")), ME, NOW)).toEqual({ kind: "cancelled", request: ended("cancelled") })
        expect(askingState(read(ended("approved")), ME, NOW)).toEqual({ kind: "approved", request: ended("approved") })
        expect(askingState(read(ended("superseded")), ME, NOW)).toEqual({ kind: "superseded", request: ended("superseded") })
        for (const reason of ["withdrawn", "used", "revoked"] as const) {
            expect(askingState(read(ended(reason)), ME, NOW)).toEqual({ kind: "choice" })
        }
    })
})

describe("the prompt on an approved device", () => {
    const passphrase: Admission = { kind: "in", by: "passphrase" }
    const partner: Admission = { kind: "in", by: "partner", partner: THEM }
    const keptWords: Admission = { kind: "in", by: "kept-words", cause: "reset-by-unapproved" }
    const theirs = request({ deviceId: THEM })

    it("asks about another device's open request whenever the IdP shows one: it shows it only to the devices that may cancel it", () => {
        expect(requestToPrompt(read(theirs), ME)).toBe(theirs)
    })

    it("asks nothing about its own request, an ended one, or none shown", () => {
        expect(requestToPrompt(read(request()), ME)).toBeNull()
        expect(requestToPrompt(read({ ...theirs, ended: { reason: "cancelled", at: NOW } }), ME)).toBeNull()
        expect(requestToPrompt({ kind: "none" }, ME)).toBeNull()
        expect(requestToPrompt({ kind: "elsewhere" }, ME)).toBeNull()
    })

    it("is put off by \"Not now\" for that request only", () => {
        expect(promptShown(theirs, new Set(["r1"]))).toBeNull()
        expect(promptShown(theirs, new Set(["r0"]))).toBe(theirs)
        expect(promptShown(null, new Set())).toBeNull()
    })

    it("only an approved device counts as approved here, and turns the second factor on once there is a key", () => {
        expect([passphrase, partner, keptWords, { kind: "out" } as Admission, null].map(approvedHere)).toEqual([true, true, false, false, false])
        expect(mayTurnOnSecondFactor({ kind: "no-key" }, null)).toBe(true)
        expect(mayTurnOnSecondFactor({ kind: "holds", generation: 1, settled: true }, passphrase)).toBe(true)
        const mismatch = { kind: "mismatch", generation: 2, setByDevice: THEM, reason: "check-value", held: 1 } as const
        expect(mayTurnOnSecondFactor(mismatch, keptWords)).toBe(false)
        expect(mayTurnOnSecondFactor({ kind: "no-passphrase", generation: 1 }, { kind: "out" })).toBe(false)
    })

    it("withholds a revoke the instance refuses: an approved device's, from a device it doesn't count approved", () => {
        expect(revokeWithheld(new Set([THEM]), ME, { device_id: THEM })).toBe(true)
        expect(revokeWithheld(new Set([THEM]), ME, { device_id: "other" })).toBe(false)
        expect(revokeWithheld(new Set([THEM, ME]), ME, { device_id: THEM })).toBe(false)
        expect(revokeWithheld(null, ME, { device_id: THEM })).toBe(false)
        expect(revokeWithheld(new Set([THEM]), null, { device_id: THEM })).toBe(false)
    })

    it("words the password change by the instance's mode", () => {
        const info = (open: boolean) => ({ name: "Aotearoa", users: 3, openRegistrations: open })
        expect(passwordChange(info(true), false)).toBe("forgot-password")
        expect(passwordChange(info(true), true)).toBe("forgot-password")
        expect(passwordChange(info(false), false)).toBe("ask-an-admin")
        expect(passwordChange(info(false), true)).toBe("where-it-runs")
        expect(passwordChange(null, false)).toBe("unknown")
    })
})

describe("refusals and a finish refused as too early", () => {
    it("tells each refusal of asking and finishing by its code", () => {
        const refused = (status: number, code: string, readyAt: number | null = null) => new IdpError(status, code, "refused", null, readyAt)
        expect(askRefusal(refused(409, "already_approved"))).toBe("not-needed")
        expect(askRefusal(refused(409, "no_history_key"))).toBe("not-needed")
        expect(askRefusal(refused(409, "start_over_pending"))).toBe("elsewhere")
        expect(askRefusal(refused(429, "too_many_requests"))).toBe("too-many")
        expect(askRefusal(refused(409, "no_root_key"))).toBeNull()
        expect(askRefusal(new Error("offline"))).toBeNull()
        expect(finishRefusal(refused(403, "start_over_not_ready", NOW))).toEqual({ kind: "not-ready", readyAt: NOW })
        expect(finishRefusal(refused(403, "start_over_required"))).toEqual({ kind: "request-required" })
        expect(finishRefusal(refused(409, "history_key_conflict"))).toBeNull()
        expect(readsElsewhere(refused(403, "approval_required"))).toBe(true)
        expect(endedAlready(refused(410, "start_over_ended"))).toBe(true)
        expect(endedAlready(refused(404, "not_found"))).toBe(true)
        expect(endedAlready(refused(403, "approval_required"))).toBe(false)
    })

    it("reads how far this device's clock runs ahead from the access token", () => {
        const issued = NOW - 60_000
        expect(clockLeadOf(accessToken(issued, "alice", issued), issued + 90_000)).toBe(90_000)
        expect(clockLeadOf(accessToken(issued, "alice", issued), null)).toBeNull()
        expect(clockLeadOf(null, NOW)).toBeNull()
    })

    it("holds a refused finish back until the IdP's date passes on this device's clock, or the date moves", () => {
        const refusedAt = NOW + 5 * 60_000
        // This clock runs 5 minutes ahead: ready by it, not by the IdP's.
        const hold = holdAfterRefusal("r1", NOW, refusedAt, 5 * 60_000)
        expect(hold).toEqual({ requestId: "r1", readyAt: NOW, until: NOW + 5 * 60_000 })
        const open = request({ readyAt: NOW })
        expect(heldBack(open, hold, refusedAt + 1)).toBe(false)
        expect(heldBack(open, hold, NOW + 60_000)).toBe(true)
        expect(heldBack({ ...open, readyAt: NOW + DAY }, hold, NOW + 60_000)).toBe(false)
        expect(heldBack({ ...open, id: "r2" }, hold, NOW + 60_000)).toBe(false)
        expect(heldBack(open, null, NOW)).toBe(false)
    })

    it("without the token's clock, waits one reread past the refusal before a press goes again", () => {
        const hold = holdAfterRefusal("r1", NOW, NOW + 60_000, null)
        expect(hold.until).toBe(NOW + 60_000 + START_OVER_REREAD_MS)
    })
})

function answering(status: number, body?: unknown) {
    const sent: string[] = []
    const fetch = vi.fn(async (request: Request) => {
        sent.push(await request.clone().text())
        return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetch)
    return Object.assign(fetch, { sent })
}

function requested(fetch: ReturnType<typeof vi.fn>): [string, string, string | null] {
    const request = fetch.mock.calls[0][0] as Request
    return [request.method, new URL(request.url).pathname, request.headers.get("Authorization")]
}

const refusal = (error: string) => ({ error, error_description: "refused" })

describe("the routes", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("names the session's device with its proof, the device id lowercased, and tells a refused proof by its code", async () => {
        const fetch = answering(204)
        const proof = new Uint8Array(64).fill(9)
        await new SessionApiAdapter().linkDevice(`${IDP}/`, "tok", ME.toUpperCase(), proof)
        expect(requested(fetch)).toEqual(["PUT", "/api/sessions/current/device", "Bearer tok"])
        expect(JSON.parse(fetch.sent[0])).toEqual({ device_id: ME, signature: bytesToBase64(proof) })

        answering(403, refusal("device_proof_invalid"))
        expect(isDeviceProofInvalid(await new SessionApiAdapter().linkDevice(IDP, "tok", ME, proof).catch((e: unknown) => e))).toBe(true)
    })

    it("asks with no body, and reads the request as it matures as of the answer", async () => {
        const fetch = answering(201, { id: "R1", created_at: "2026-11-09T10:00:00Z", ready_at: "2026-11-16T10:00:00Z" })
        expect(await new StartOverApiAdapter().ask(IDP, "tok")).toEqual({
            id: "r1",
            createdAt: Date.UTC(2026, 10, 9, 10),
            readyAt: Date.UTC(2026, 10, 16, 10),
        })
        expect(requested(fetch)).toEqual(["POST", "/api/history/start-over", "Bearer tok"])
        expect(fetch.sent[0]).toBe("")

        answering(200, { id: "r1", created_at: "nope", ready_at: "2026-11-16T10:00:00Z" })
        await expect(new StartOverApiAdapter().ask(IDP, "tok")).rejects.toThrow(/isn't one/)
    })

    it("tells each refusal of asking by its code", async () => {
        for (const [status, code] of [
            [409, "already_approved"],
            [409, "no_history_key"],
            [409, "no_root_key"],
            [409, "start_over_pending"],
            [429, "too_many_requests"],
            [403, "device_required"],
        ] as const) {
            answering(status, refusal(code))
            const refused = await new StartOverApiAdapter().ask(IDP, "tok").catch((e: unknown) => e)
            expect(refused).toBeInstanceOf(IdpError)
            expect([(refused as IdpError).status, (refused as IdpError).code]).toEqual([status, code])
        }
    })

    it("reads the open request, or the asker's ended one with how it ended; none on a 404", async () => {
        const fetch = answering(200, {
            id: "r1",
            device_id: THEM.toUpperCase(),
            display_name: "Chrome on Windows",
            created_at: "2026-11-09T10:00:00Z",
            ready_at: "2026-11-16T10:00:00Z",
            ended: null,
        })
        expect(await new StartOverApiAdapter().read(IDP, "tok")).toEqual({
            id: "r1",
            deviceId: THEM,
            displayName: "Chrome on Windows",
            createdAt: Date.UTC(2026, 10, 9, 10),
            readyAt: Date.UTC(2026, 10, 16, 10),
            ended: null,
        })
        expect(requested(fetch)).toEqual(["GET", "/api/history/start-over", "Bearer tok"])

        for (const reason of ["cancelled", "withdrawn", "used", "superseded", "revoked", "approved"]) {
            answering(200, {
                id: "r1",
                device_id: ME,
                display_name: "",
                created_at: "2026-11-09T10:00:00Z",
                ready_at: "2026-11-09T10:00:00Z",
                ended: { reason, at: "2026-11-10T10:00:00Z" },
            })
            expect((await new StartOverApiAdapter().read(IDP, "tok"))?.ended).toEqual({ reason, at: Date.UTC(2026, 10, 10, 10) })
        }

        answering(200, { id: "r1", device_id: ME, display_name: "", created_at: "2026-11-09T10:00:00Z", ready_at: "2026-11-09T10:00:00Z", ended: { reason: "expired", at: "2026-11-10T10:00:00Z" } })
        await expect(new StartOverApiAdapter().read(IDP, "tok")).rejects.toThrow(/isn't one/)

        answering(404, refusal("not_found"))
        expect(await new StartOverApiAdapter().read(IDP, "tok")).toBeNull()

        answering(403, refusal("approval_required"))
        expect(isApprovalRequired(await new StartOverApiAdapter().read(IDP, "tok").catch((e: unknown) => e))).toBe(true)
    })

    it("ends a request by its id, and tells one that ended", async () => {
        const fetch = answering(204)
        await new StartOverApiAdapter().end(IDP, "tok", "r1")
        expect(requested(fetch)).toEqual(["DELETE", "/api/history/start-over/r1", "Bearer tok"])

        answering(410, refusal("start_over_ended"))
        const ended = await new StartOverApiAdapter().end(IDP, "tok", "r1").catch((e: unknown) => e)
        expect([(ended as IdpError).status, (ended as IdpError).code]).toEqual([410, "start_over_ended"])
    })

    it("reads when a request matures from the key's refusal", async () => {
        answering(403, { ...refusal("start_over_not_ready"), ready_at: "2026-11-16T10:00:00Z" })
        const key = { generation: 2, salt: new Uint8Array(16), checkValue: new Uint8Array(32), approvalPublicKey: new Uint8Array(32) }
        const refused = await new HistoryArchiveApiAdapter().setKey(IDP, "tok", key).catch((e: unknown) => e)
        expect([(refused as IdpError).code, (refused as IdpError).readyAt]).toEqual(["start_over_not_ready", Date.UTC(2026, 10, 16, 10)])
    })
})

describe("the flows", () => {
    function port(change: Partial<IStartOverPort>): IStartOverPort {
        return { ask: vi.fn(), read: vi.fn(async () => null), end: vi.fn(), ...change }
    }

    /** An account whose laptop holds generation 1, and a phone not approved; the IdP keeps the rule. */
    async function account() {
        const idp = new FakeHistoryIdp()
        idp.startOverRule = true
        const laptop = historyDevice(idp, "laptop")
        await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
        const phone = historyDevice(idp, "phone")
        return { idp, laptop, phone }
    }

    it("asks once set up, and answers the request with this device as its asker", async () => {
        const { idp, phone } = await account()
        idp.approvedLastUse = Date.now()
        const asked = await askToStartOverUseCase({ ...phone.deps, startOverPort: idp.startOverRoutes() })(IDP, phone.token, ACTOR)
        expect(asked).toMatchObject({ kind: "asked", request: { deviceId: phone.storage.deviceId, ended: null } })
        expect(idp.log.slice(-2)).toEqual(["register device", "name session"])
        if (asked.kind !== "asked") return
        expect(asked.request.readyAt - asked.request.createdAt).toBe(7 * 86_400_000)
        expect(startOverReady(asked.request, Date.now())).toBe(false)

        // Asked again, its own open request back.
        const again = await askToStartOverUseCase({ ...phone.deps, startOverPort: idp.startOverRoutes() })(IDP, phone.token, ACTOR)
        expect(again).toMatchObject({ kind: "asked", request: { id: asked.request.id } })
    })

    it("needs no request on an approved device or with no key, is told of another's, and of too many", async () => {
        const refusing = (status: number, code: string) => port({ ask: async () => Promise.reject(new IdpError(status, code, "refused")) })
        const { laptop, idp } = await account()
        const tried = await askToStartOverUseCase({ ...laptop.deps, startOverPort: idp.startOverRoutes() })(IDP, laptop.token, ACTOR)
        expect(tried).toEqual({ kind: "not-needed" })
        for (const [status, code, kind] of [
            [409, "no_history_key", "not-needed"],
            [409, "start_over_pending", "elsewhere"],
            [429, "too_many_requests", "too-many"],
        ] as const) {
            const { phone } = await account()
            expect(await askToStartOverUseCase({ ...phone.deps, startOverPort: refusing(status, code) })(IDP, phone.token, ACTOR)).toEqual({ kind })
        }
    })

    it("is told another device asked first even with an ended request of its own, as the IdP answers since", async () => {
        const { idp, phone } = await account()
        idp.approvedLastUse = Date.now()
        const routes = idp.startOverRoutes()
        await askToStartOverUseCase({ ...phone.deps, startOverPort: routes })(IDP, phone.token, ACTOR)
        await routes.end(IDP, phone.token, idp.startOvers[0].id)
        expect(await readStartOverUseCase({ startOverPort: routes })(IDP, phone.token)).toMatchObject({ kind: "request", request: { ended: { reason: "withdrawn" } } })

        const tablet = historyDevice(idp, "tablet")
        await nameSession(tablet)
        await routes.ask(IDP, tablet.token)
        expect(await readStartOverUseCase({ startOverPort: routes })(IDP, phone.token)).toEqual({ kind: "elsewhere" })
    })

    it("counts a device approved with a code by an approved device as approved, ending its request", async () => {
        const { idp, laptop, phone } = await account()
        idp.approvedLastUse = Date.now()
        await askToStartOverUseCase({ ...phone.deps, startOverPort: idp.startOverRoutes() })(IDP, phone.token, ACTOR)
        await laptop.deps.deviceDirectoryPort.approveByDevice(IDP, laptop.token, phone.storage.deviceId, new Uint8Array(64))
        expect(idp.startOvers[0].ended?.reason).toBe("approved")
        expect(await askToStartOverUseCase({ ...phone.deps, startOverPort: idp.startOverRoutes() })(IDP, phone.token, ACTOR)).toEqual({ kind: "not-needed" })
    })

    it("reads another device's request it may not read as elsewhere, and ends one gone as gone", async () => {
        const forbidden = port({ read: async () => Promise.reject(new IdpError(403, "approval_required", "refused")) })
        expect(await readStartOverUseCase({ startOverPort: forbidden })(IDP, "tok")).toEqual({ kind: "elsewhere" })
        expect(await readStartOverUseCase({ startOverPort: port({}) })(IDP, "tok")).toEqual({ kind: "none" })

        expect(await endStartOverUseCase({ startOverPort: port({ end: async () => undefined }) })(IDP, "tok", "r1")).toBe("ended")
        const gone = port({ end: async () => Promise.reject(new IdpError(410, "start_over_ended", "ended")) })
        expect(await endStartOverUseCase({ startOverPort: gone })(IDP, "tok", "r1")).toBe("gone")
    })

    it("prompts by the IdP's answer, whatever this device last found of itself; offers the code only to a device that can answer one", async () => {
        const theirs = request({ deviceId: THEM })
        const read = vi.fn(async () => theirs)
        const e2ee = (standing: object | Error) =>
            ({
                historyKeyStanding: async () => (standing instanceof Error ? Promise.reject(standing) : standing),
                getDeviceId: async () => ME,
            }) as unknown as IE2eePort
        const prompt = (standing: object | Error) => startOverToPromptUseCase({ e2eePort: e2ee(standing), startOverPort: port({ read }) })(IDP, "tok")
        expect(await prompt({ kind: "holds", generation: 1, settled: true })).toEqual({ request: theirs, answersCodes: true })
        expect(await prompt({ kind: "holds", generation: 1, settled: false })).toEqual({ request: theirs, answersCodes: false })
        expect(await prompt({ kind: "mismatch", generation: 2, setByDevice: THEM, reason: "check-value", held: 1 })).toEqual({ request: theirs, answersCodes: false })
        expect(await prompt(new Error("unreadable"))).toEqual({ request: theirs, answersCodes: false })

        const forbidden = port({ read: async () => Promise.reject(new IdpError(403, "approval_required", "refused")) })
        expect(await startOverToPromptUseCase({ e2eePort: e2ee({ kind: "no-key" }), startOverPort: forbidden })(IDP, "tok")).toBeNull()
    })

    it("may turn the second factor on as its last check found it", async () => {
        const e2ee = (standing: object, admission: Admission | null) =>
            ({ historyKeyStanding: async () => standing, recordedAdmission: async () => admission }) as unknown as IE2eePort
        expect(await mayTurnOnSecondFactorUseCase(e2ee({ kind: "no-key" }, null))()).toBe(true)
        expect(await mayTurnOnSecondFactorUseCase(e2ee({ kind: "no-passphrase", generation: 1 }, { kind: "out" }))()).toBe(false)
    })

    it("finishes only once its request matured: the date it holds, the pending key erased, then the next generation", async () => {
        const { idp, phone } = await account()
        idp.approvedLastUse = Date.now()
        const finish = () => startOverUseCase({ ...phone.deps, pendingKeyLock: undefined })({ idpUrl: IDP, accessToken: phone.token, actorUri: ACTOR })

        expect(await finish()).toEqual({ kind: "request-required" })
        expect(phone.storage.pending).toBeNull()
        expect(idp.key?.generation).toBe(1)

        const asked = await askToStartOverUseCase({ ...phone.deps, startOverPort: idp.startOverRoutes() })(IDP, phone.token, ACTOR)
        if (asked.kind !== "asked") throw new Error("not asked")
        expect(await finish()).toEqual({ kind: "not-ready", readyAt: asked.request.readyAt })
        expect(phone.storage.pending).toBeNull()

        // A week on, no approved device used since it asked.
        idp.startOvers[0].createdAt -= 8 * DAY
        idp.approvedLastUse = Date.now() - 8 * DAY
        const done = await finish()
        expect(done.kind).toBe("started-over")
        expect(idp.key).toMatchObject({ generation: 2, setByDevice: phone.storage.deviceId })
        expect(idp.startOvers[0].ended?.reason).toBe("used")
    })
})
