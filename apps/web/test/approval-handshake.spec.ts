/**
 * The code handshake (`identity-provider/specs/e2ee.md § 3.10`): its rules, then two real E2EE
 * engines — real root keys and HPKE keys, attestations under a JWKS — over a relay keeping the
 * IdP's rules. A full exchange approves both ways and keeps each as the other's partner, with the
 * keys the exchange gave. A wrong code, a relay that tampers, reflects, replays, renames a poster
 * or guesses itself, keys the list doesn't show, an approval that doesn't verify, a third device
 * or a device that doesn't act approve nothing — and none of them draws a new code by itself: only
 * a code nobody answered, its 10 minutes run out on the asking device's clock, is renewed without
 * the user.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { ApprovalHandshake, HandshakeMessage, decodeMessage, encodeMessage } from "@pinai/crypto/approval-handshake"
import { approvalBytes } from "@pinai/crypto/canonical-bytes"
import { randomScalar, spake2Share } from "@pinai/crypto/spake2-p256"
import {
    APPROVAL_REQUEST_LIFETIME_MS,
    ASKER_REQUESTS_PER_HOUR,
    HandshakeRefused,
    RATE_LIMITED_RETRY_MS,
    answerableRequests,
    canonicalId,
    closedMeans,
    codeDigits,
    codeHalves,
    failureShown,
    isRefusedForGood,
    isWholeCode,
    mayAnswer,
    mayAsk,
    nextCodeWording,
    nextRequestAt,
    noteForNext,
    peerAgainstList,
    pollDelay,
    relayRefusal,
    renewsByItself,
    requestLifeLeft,
    type ApprovalRequest,
} from "@pinai/domain/models/approval-handshake"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import type { HandshakePartner, TrustEvent } from "@pinai/domain/models/device-trust"
import { IdpError } from "@pinai/domain/models/idp-error"
import { ApprovalAsking, answeringRun, type AskingState, type HandshakeRun } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"

import { FakeAccount, type Clock } from "./setup/approval-relay"
import { ACTOR, FakeHistoryIdp, IDP, MemoryHistoryStorage, historyDevice } from "./setup/history-idp"
import { FakeIssuers, listedDevice, testDevice } from "./setup/issuers"

const issuers = new FakeIssuers()
const MINUTE = 60_000

afterEach(() => {
    vi.restoreAllMocks()
})

describe("the handshake's rules", () => {
    const request = (change: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
        id: "r1",
        deviceId: "phone",
        displayName: "Chrome on Android",
        approverDeviceId: null,
        createdAt: "2026-11-04T12:00:00Z",
        expiresAt: "2026-11-04T12:10:00Z",
        ...change,
    })

    it("lets a device without the current passphrase ask, and only one acting on approval answer", () => {
        expect(mayAsk({ kind: "no-passphrase" })).toBe(true)
        expect(mayAsk({ kind: "mismatch", generation: 2, setByDevice: "n", reason: "check-value", held: 1 })).toBe(true)
        expect(mayAsk({ kind: "holds", generation: 1, settled: true })).toBe(false)
        expect(mayAnswer({ kind: "holds", generation: 1, settled: true })).toBe(true)
        expect(mayAnswer({ kind: "no-passphrase" })).toBe(false)
        expect(mayAnswer({ kind: "mismatch", generation: 1, setByDevice: null, reason: "approval-key", held: 1 })).toBe(false)
    })

    it("offers only another device's unanswered requests, not set aside, and none to a device that doesn't act", () => {
        const input = { thisDevice: "laptop", acting: true, dismissed: new Set<string>() }
        const requests = [
            request(),
            request({ id: "own", deviceId: "laptop" }),
            request({ id: "taken", approverDeviceId: "tablet" }),
            request({ id: "answered-here", approverDeviceId: "laptop" }),
            request({ id: "older", createdAt: "2026-11-04T11:59:00Z", expiresAt: "2000-01-01T00:00:00Z" }),
            request({ id: "aside" }),
        ]
        const ids = (change = {}) => answerableRequests(requests, { ...input, ...change }).map((r) => r.id)

        // The relay lists open requests only: no clock of this device's judges them.
        expect(ids({ dismissed: new Set(["aside"]) })).toEqual(["older", "r1"])
        expect(ids({ acting: false })).toEqual([])
    })

    it("writes ids as § 7.2 does, and refuses what is no UUID", () => {
        expect(canonicalId("0190C7A2-0000-7000-8000-00000000ABCD")).toBe("0190c7a2-0000-7000-8000-00000000abcd")
        expect(canonicalId("phone")).toBeNull()
        expect(canonicalId(42)).toBeNull()
    })

    it("reads a close by the step it came at: the asker waiting for a confirmation meets a wrong code", () => {
        expect(closedMeans("asker", "confirming")).toBe("wrong-code")
        expect(closedMeans("asker", "waiting")).toBe("ended")
        expect(closedMeans("answerer", "confirming")).toBe("ended")
        expect(closedMeans("answerer", "ready")).toBe("ended")
    })

    it("renews a code by itself only when nobody answered it and its 10 minutes ran out here", () => {
        const openedAt = 1_000_000
        const at = openedAt + APPROVAL_REQUEST_LIFETIME_MS
        expect(renewsByItself({ reason: "expired", answered: false, openedAt, now: at })).toBe(true)
        expect(renewsByItself({ reason: "expired", answered: true, openedAt, now: at })).toBe(false)
        expect(renewsByItself({ reason: "expired", answered: false, openedAt, now: at - 1 })).toBe(false)
        for (const reason of ["wrong-code", "ended", "tampered", "keys-refused", "error"] as const) {
            expect(renewsByItself({ reason, answered: false, openedAt, now: at })).toBe(false)
        }
    })

    it("tells the relay's refusals apart by their code, and those worth no retry", () => {
        expect(relayRefusal(new IdpError(409, "approval_request_taken", "x"))).toBe("taken")
        expect(relayRefusal(new IdpError(410, "approval_request_ended", "x"))).toBe("ended")
        expect(relayRefusal(new IdpError(404, "not_found", "x"))).toBe("ended")
        expect(relayRefusal(new IdpError(409, "approval_request_full", "x"))).toBe("tampered")
        expect(relayRefusal(new IdpError(403, "access_denied", "x"))).toBe("error")
        expect(relayRefusal(new Error("offline"))).toBeNull()
        expect(isRefusedForGood(new IdpError(400, "invalid_request", "x"))).toBe(true)
        expect(isRefusedForGood(new IdpError(503, "unavailable", "x"))).toBe(false)
        expect(isRefusedForGood(new IdpError(429, "too_many_requests", "x"))).toBe(false)
        expect(isRefusedForGood(new Error("socket hang up"))).toBe(false)
    })

    it("backs off reading the relay after failures in a row, and waits long when asked to slow down", () => {
        expect([0, 1, 2, 3, 9].map((n) => pollDelay(n, new Error("x")))).toEqual([3_000, 6_000, 12_000, 30_000, 30_000])
        expect(pollDelay(1, new IdpError(429, "too_many_requests", "x"))).toBe(RATE_LIMITED_RETRY_MS)
    })

    it("says on the Door the failures worth saying, and carries a wrong code over to the device's next request", () => {
        expect(failureShown("wrong-code", "confirming")).toBe(true)
        expect(failureShown("taken", "ready")).toBe(false)
        expect(failureShown("cancelled", "confirming")).toBe(false)
        expect(failureShown("ended", "ready")).toBe(false)
        expect(failureShown("ended", "exchanging")).toBe(true)
        expect(failureShown("not-acting", "ready")).toBe(true)
        expect(noteForNext("wrong-code")).toBe("wrong-code")
        expect(noteForNext("tampered")).toBeNull()
    })

    it("takes the code typed or pasted as six digits, shown 3 + 3", () => {
        expect(codeDigits("482 913")).toBe("482913")
        expect(codeDigits("482-913-77")).toBe("482913")
        expect(codeDigits("4a8b2")).toBe("482")
        expect(isWholeCode("482913")).toBe(true)
        expect(isWholeCode("48291")).toBe(false)
        expect(codeHalves("482913")).toEqual(["482", "913"])
    })

    it("frames every message with its version and type, at its type's size, and refuses any other", () => {
        const confirm = encodeMessage(HandshakeMessage.confirmA, new Uint8Array(32).fill(7))
        expect([...confirm.slice(0, 2)]).toEqual([1, 3])
        expect(confirm.length).toBe(34)
        expect(decodeMessage(confirm, HandshakeMessage.confirmA)).toEqual(new Uint8Array(32).fill(7))
        expect(() => decodeMessage(confirm, HandshakeMessage.keysA)).toThrow(HandshakeRefused)
        expect(() => decodeMessage(Uint8Array.of(2, ...confirm.slice(1)), HandshakeMessage.confirmA)).toThrow(HandshakeRefused)
        expect(() => decodeMessage(confirm.slice(0, 33), HandshakeMessage.confirmA)).toThrow(HandshakeRefused)
    })

    it("checks the peer's keys against its listed row, and decides nothing from a list naming an id twice", () => {
        const device = testDevice(issuers, ACTOR)
        const row = listedDevice(device)
        const peer = { deviceId: device.deviceId, rootKey: device.rootKey.publicKey, hpkeKey: row.hpke_public_key! }
        expect(peerAgainstList([row], peer, [])).toBeNull()
        expect(peerAgainstList([], peer, [])).toBe("not-listed")
        expect(peerAgainstList([row, listedDevice(testDevice(issuers, ACTOR)), row], peer, [])).toBe("duplicated")
        expect(peerAgainstList([row], peer, [device.deviceId])).toBe("revoked")
        expect(peerAgainstList([{ ...row, revoked_at: "2026-11-04T00:00:00Z" }], peer, [])).toBe("revoked")
        expect(peerAgainstList([row], { ...peer, rootKey: new Uint8Array(32) }, [])).toBe("root-key")
        expect(peerAgainstList([row], { ...peer, hpkeKey: new Uint8Array(32) }, [])).toBe("hpke-key")
    })

    it("keeps the page's budget: eight an hour, then when the oldest turns an hour old", () => {
        const start = Date.parse("2026-11-04T12:00:00Z")
        const opened = Array.from({ length: ASKER_REQUESTS_PER_HOUR }, (_, i) => start + i * MINUTE)
        const at = start + 20 * MINUTE
        expect(nextRequestAt(opened.slice(1), at)).toBe(at)
        expect(nextRequestAt(opened, at)).toBe(start + 60 * MINUTE)
    })

    it("words the next code and fills the ring from the deadline on this device's clock", () => {
        const at = 1_000_000
        expect(nextCodeWording(at + 8 * MINUTE, at)).toBe("new in 8 min")
        expect(nextCodeWording(at + 40_000, at)).toBe("new in 40 s")
        expect(requestLifeLeft(at + 8 * MINUTE, at)).toBeCloseTo(8 / 10)
        expect(requestLifeLeft(at - 1, at)).toBe(0)
    })
})

type Device = ReturnType<typeof historyDevice>

/** An account whose laptop holds generation 1 and acts on approval; a phone signed in without the words. */
async function account() {
    const idp = new FakeHistoryIdp()
    const laptop = historyDevice(idp, "laptop", new MemoryHistoryStorage(), issuers.jwks)
    const outcome = await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    if (outcome.kind !== "holds") throw new Error("the first device didn't set the key")
    const phone = historyDevice(idp, "phone", new MemoryHistoryStorage(), issuers.jwks)
    const net = new FakeAccount(issuers)
    net.enrol(laptop, "Firefox on Linux")
    net.enrol(phone, "Chrome on Android")
    return { idp, laptop, phone, net }
}

function asker(net: FakeAccount, device: Device, clock?: Clock, opened: number[] = []) {
    return new ApprovalAsking(net.deps(device), net.context(device, clock), opened)
}

async function answering(net: FakeAccount, device: Device, requestId?: string): Promise<HandshakeRun> {
    const open = await net.relay.openRequests(IDP, device.token)
    const request = open.find((r) => (requestId ? r.id === requestId : r.deviceId !== device.storage.deviceId))
    if (!request) throw new Error("no request to answer")
    return answeringRun(net.deps(device), net.context(device), request, device.storage.deviceId)
}

function shown(asking: ApprovalAsking): Extract<AskingState, { kind: "showing" }> {
    if (asking.state.kind !== "showing") throw new Error(`not showing a code: ${asking.state.kind}`)
    return asking.state
}

/** Each side reads what the other posted, in turn, until both settle. */
async function exchange(asking: ApprovalAsking, run: HandshakeRun) {
    for (let i = 0; i < 8 && !(asking.state.kind === "approved" && run.outcome); i++) {
        await asking.tick()
        await run.advance()
    }
}

function keysOf(device: Device): HandshakePartner {
    const { deviceId, rootKey, hpkeKey } = device.storage
    return { deviceId, rootKey: rootKey.publicKey, hpkeKey: hpkeKey.publicKey }
}

// Rows come back through structured cloning: compared by their bytes.
function plain(partner: HandshakePartner) {
    return { deviceId: partner.deviceId, rootKey: [...partner.rootKey], hpkeKey: [...partner.hpkeKey] }
}

function heard(device: Device): TrustEvent[] {
    const stood: TrustEvent[] = []
    device.e2ee.onTrustEvent((event) => stood.push(event))
    return stood
}

/** The relay, through a device of the account, posting as if it answered. */
async function relayPosts(net: FakeAccount, through: Device, requestId: string, body: Uint8Array) {
    await net.relay.post(IDP, through.token, requestId, body)
}

const noApprovalBetween = (net: FakeAccount, phone: Device) => {
    expect(net.approvals).toEqual([])
    expect(phone.storage.trust.partners).toEqual([])
}

beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

describe("a code handshake between two devices", () => {
    it("approves both ways, the answerer first, each keeping the other with the keys the exchange gave", async () => {
        const { laptop, phone, net } = await account()
        const closed = vi.spyOn(ApprovalHandshake.prototype, "close")
        const asking = asker(net, phone)

        await asking.tick()
        const requestId = net.last()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        await exchange(asking, run)

        expect(run.outcome).toEqual({ kind: "approved", partner: keysOf(phone) })
        expect(asking.state).toEqual({ kind: "approved", partner: keysOf(laptop) })
        expect(net.approvals).toEqual([
            { approver: laptop.storage.deviceId, approved: phone.storage.deviceId },
            { approver: phone.storage.deviceId, approved: laptop.storage.deviceId },
        ])
        expect(net.isOpen(requestId)).toBe(false)
        // Both sessions dropped their secrets.
        expect(closed.mock.contexts.length).toBeGreaterThanOrEqual(2)

        const bodies = net.bodies(requestId)
        expect(bodies.map((b) => [b[0], b[1], b.length])).toEqual([
            [1, 1, 67],
            [1, 2, 67],
            [1, 3, 34],
            [1, 4, 114],
            [1, 5, 82],
        ])
        expect(net.requests.get(requestId)?.messages.map((m) => m.deviceId)).toEqual(
            [phone, laptop, phone, laptop, phone].map((d) => d.storage.deviceId),
        )
    })

    it("keeps the partners from the exchange, whatever the list says afterwards", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        await exchange(asking, run)

        net.list(listedDevice(testDevice(issuers, ACTOR, phone.storage.deviceId)))

        expect(laptop.storage.trust.partners.map(plain)).toEqual([plain(keysOf(phone))])
        expect((await laptop.e2ee.handshakePartners()).map(plain)).toEqual([plain(keysOf(phone))])
        expect(phone.storage.trust.partners.map(plain)).toEqual([plain(keysOf(laptop))])
    })

    it("fails a wrong code on both sides: the request ended, nothing sent after, nothing approved, no new code until asked", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const { code } = shown(asking)
        const requestId = net.last()
        const run = await answering(net, laptop)

        await run.answer(code === "000000" ? "000001" : "000000")
        await asking.tick()
        await run.advance()

        expect(run.outcome).toEqual({ kind: "failed", reason: "wrong-code" })
        expect(net.isOpen(requestId)).toBe(false)

        await asking.tick()
        await asking.tick()
        expect(asking.state).toEqual({ kind: "stopped", failure: "wrong-code" })
        expect(net.requests.size).toBe(1)
        expect(net.bodies(requestId).map((b) => b[1])).toEqual([1, 2, 3])
        noApprovalBetween(net, phone)

        await asking.again()
        expect(net.last()).not.toBe(requestId)
        expect(shown(asking).failure).toBe("wrong-code")
    })

    it("never renews by itself after the relay answers a guessed share and goes silent", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const first = net.last()
        await relayPosts(net, laptop, first, encodeMessage(HandshakeMessage.shareB, spake2Share("B", 123456789n, randomScalar())))

        await asking.tick()
        expect(net.bodies(first).map((b) => b[1])).toEqual([1, 2, 3])
        expect(shown(asking)).toMatchObject({ phase: "confirming", answered: true })

        net.now.at += APPROVAL_REQUEST_LIFETIME_MS + 1_000
        await asking.tick()
        await asking.tick()

        expect(asking.state).toEqual({ kind: "stopped", failure: "expired" })
        expect(net.requests.size).toBe(1)
    })

    it("never renews by itself after the relay takes the confirmation and answers 502", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const first = net.last()
        await relayPosts(net, laptop, first, encodeMessage(HandshakeMessage.shareB, spake2Share("B", 42n, randomScalar())))
        net.failNext("post", new Error("502 Bad Gateway"))

        await asking.tick()
        expect(asking.state).toEqual({ kind: "stopped", failure: "error" })

        net.now.at += 31_000
        await asking.tick()
        expect(asking.state).toEqual({ kind: "stopped", failure: "error" })
        expect(net.requests.size).toBe(1)
    })

    it("ends at once when its own approval is refused for good, and stays stopped past the deadline", async () => {
        const { laptop, phone, net } = await account()
        const approve = net.directory.approveByDevice.bind(net.directory)
        vi.spyOn(net.directory, "approveByDevice").mockImplementation(async (idp, token, id, signature) => {
            if (token === phone.token) throw new IdpError(400, "invalid_request", "signature does not verify")
            return approve(idp, token, id, signature)
        })
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        for (let i = 0; i < 6; i++) {
            await asking.tick()
            await run.advance()
        }

        expect(run.outcome?.kind).toBe("approved")
        expect(asking.state).toEqual({ kind: "stopped", failure: "error" })

        net.now.at += 11 * MINUTE
        await expect(asking.tick()).resolves.toBeUndefined()
        expect(asking.state).toEqual({ kind: "stopped", failure: "error" })
        expect(net.requests.size).toBe(1)
    })

    it("fails when the relay names another device as the answerer: the transcript's identities differ", async () => {
        const { idp, laptop, phone, net } = await account()
        const tablet = historyDevice(idp, "tablet", new MemoryHistoryStorage(), issuers.jwks)
        net.enrol(tablet, "Safari on iPadOS")
        net.poster = (m) => (m.deviceId === laptop.storage.deviceId ? tablet.storage.deviceId : m.deviceId)
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)

        await run.answer(shown(asking).code)
        await asking.tick()
        await run.advance()
        await asking.tick()

        expect(run.outcome).toEqual({ kind: "failed", reason: "wrong-code" })
        expect(asking.state).toEqual({ kind: "stopped", failure: "wrong-code" })
        noApprovalBetween(net, phone)
    })

    it("gets nowhere reflecting the asker's own share back to it", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const first = net.last()
        const [shareA] = net.bodies(first)

        await relayPosts(net, laptop, first, encodeMessage(HandshakeMessage.shareB, shareA.slice(2)))
        await asking.tick()
        expect(shown(asking).phase).toBe("confirming")
        await net.relay.close(IDP, laptop.token, first)
        await asking.tick()

        expect(asking.state).toEqual({ kind: "stopped", failure: "wrong-code" })
        noApprovalBetween(net, phone)
    })

    it("refuses its own message echoed back as it was", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const first = net.last()

        await relayPosts(net, laptop, first, net.bodies(first)[0])
        await asking.tick()

        expect(asking.state).toEqual({ kind: "stopped", failure: "tampered" })
        expect(net.isOpen(first)).toBe(false)
    })

    it("refuses an answer replayed from another request", async () => {
        const { laptop, phone, net } = await account()
        const firstAsking = asker(net, phone)
        await firstAsking.tick()
        const first = net.last()
        const run = await answering(net, laptop)
        await run.answer(shown(firstAsking).code)
        await firstAsking.tick()
        await run.advance()
        const [, shareB, , confirmB] = net.bodies(first)
        await firstAsking.stop()

        const asking = asker(net, phone)
        await asking.tick()
        const second = net.last()
        await relayPosts(net, laptop, second, shareB)
        await asking.tick()
        await relayPosts(net, laptop, second, confirmB)
        await asking.tick()

        expect(asking.state).toEqual({ kind: "stopped", failure: "wrong-code" })
        expect(net.isOpen(second)).toBe(false)
        noApprovalBetween(net, phone)
    })

    it("ends on a message the relay changed: nothing approved", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const requestId = net.last()
        const run = await answering(net, laptop)
        net.tamper = (body) => {
            if (body[1] !== HandshakeMessage.confirmB) return body
            const changed = body.slice()
            changed[60] ^= 1
            return changed
        }

        await run.answer(shown(asking).code)
        await asking.tick()
        await run.advance()
        await asking.tick()
        await run.closed()

        expect(asking.state).toEqual({ kind: "stopped", failure: "tampered" })
        expect(run.outcome).toEqual({ kind: "failed", reason: "ended" })
        expect(net.bodies(requestId).map((b) => b[1])).toEqual([1, 2, 3, 4])
        noApprovalBetween(net, phone)
        expect(laptop.storage.trust.partners).toEqual([])
    })

    it("ends on a share that isn't a point of the group", async () => {
        const { laptop, phone, net } = await account()
        net.tamper = (body) => {
            if (body[1] !== HandshakeMessage.shareA) return body
            const changed = body.slice()
            changed[40] ^= 1
            return changed
        }
        const asking = asker(net, phone)
        await asking.tick()
        const requestId = net.last()
        const run = await answering(net, laptop)

        await run.answer(shown(asking).code)

        expect(run.outcome).toEqual({ kind: "failed", reason: "tampered" })
        expect(net.isOpen(requestId)).toBe(false)
        expect(net.bodies(requestId).length).toBe(1)
    })

    it("refuses a third device once another answered, and tells it the request went", async () => {
        const { idp, laptop, phone, net } = await account()
        const tablet = historyDevice(idp, "tablet", new MemoryHistoryStorage(), issuers.jwks)
        net.enrol(tablet, "Safari on iPadOS")
        vi.spyOn(tablet.e2ee, "checkHistoryKey").mockResolvedValue({ kind: "holds", generation: 1, settled: true })
        const asking = asker(net, phone)
        await asking.tick()
        const { code } = shown(asking)
        const requestId = net.last()
        const late = await answering(net, tablet)
        const run = await answering(net, laptop)

        await run.answer(code)
        await late.answer(code)

        expect(late.outcome).toEqual({ kind: "failed", reason: "taken" })
        expect(net.pushes).toContainEqual({ type: "approval_closed", requestId, to: [tablet.storage.deviceId] })
        expect(net.bodies(requestId).length).toBe(2)

        await exchange(asking, run)
        expect(asking.state.kind).toBe("approved")
        expect(net.approvals.map((a) => a.approver)).not.toContain(tablet.storage.deviceId)
    })

    it("refuses an asker whose root key from the exchange isn't the one listed: it ends and warns, approving nothing", async () => {
        const { laptop, phone, net } = await account()
        const stood = heard(laptop)
        net.list(listedDevice(testDevice(issuers, ACTOR, phone.storage.deviceId), [], { display_name: "Chrome on Android" }))
        const asking = asker(net, phone)
        await asking.tick()
        const requestId = net.last()
        const run = await answering(net, laptop)

        await run.answer(shown(asking).code)
        await exchange(asking, run)

        expect(run.outcome).toEqual({ kind: "failed", reason: "keys-refused" })
        expect(stood).toContainEqual({ kind: "handshake-keys-refused", deviceId: phone.storage.deviceId, reason: "root-key" })
        expect(net.isOpen(requestId)).toBe(false)
        noApprovalBetween(net, phone)
        expect(laptop.storage.trust.partners).toEqual([])
        // Someone answered this code: the next one takes the user's say.
        expect(asking.state).toEqual({ kind: "stopped", failure: "ended" })
    })

    it("refuses an answerer whose HPKE key isn't the one listed, before sending its own keys", async () => {
        const { laptop, phone, net } = await account()
        const stood = heard(phone)
        const row = net.rows.get(laptop.storage.deviceId) as DeviceListEntry
        net.list({ ...row, hpke_public_key: new Uint8Array(32).fill(9) })
        const asking = asker(net, phone)
        await asking.tick()
        const requestId = net.last()
        const run = await answering(net, laptop)

        await run.answer(shown(asking).code)
        await asking.tick()
        await run.advance()
        await asking.tick()
        await run.poll()

        expect(stood).toContainEqual({ kind: "handshake-keys-refused", deviceId: laptop.storage.deviceId, reason: "hpke-key" })
        expect(net.bodies(requestId).map((b) => b[1])).toEqual([1, 2, 3, 4])
        expect(run.outcome).toEqual({ kind: "failed", reason: "ended" })
        expect(asking.state).toEqual({ kind: "stopped", failure: "keys-refused" })
        noApprovalBetween(net, phone)
    })

    it("withdraws a refusal once the device passes, and keeps the latest reason meanwhile", async () => {
        const { laptop, phone, net } = await account()
        const row = net.rows.get(phone.storage.deviceId) as DeviceListEntry
        const peer = keysOf(phone)
        const withdrawn: TrustEvent[] = []
        laptop.e2ee.onTrustWithdrawn((event) => withdrawn.push(event))

        await laptop.e2ee.checkHandshakePeer(ACTOR, peer, [{ ...row, hpke_public_key: new Uint8Array(32) }])
        await laptop.e2ee.checkHandshakePeer(ACTOR, peer, [{ ...row, drk_public_key: new Uint8Array(32) }])
        const standing = () => laptop.e2ee.trustSnapshot().filter((e) => e.kind === "handshake-keys-refused")
        expect(standing()).toEqual([{ kind: "handshake-keys-refused", deviceId: peer.deviceId, reason: "root-key" }])

        expect(await laptop.e2ee.checkHandshakePeer(ACTOR, peer, [row])).toEqual({ ok: true })
        expect(standing()).toEqual([])
        expect(withdrawn.map((e) => e.kind === "handshake-keys-refused" && e.reason)).toEqual(["hpke-key", "root-key"])
    })

    it("never answers from a device that doesn't act on approval", async () => {
        const { idp, phone, net } = await account()
        const other = historyDevice(idp, "other", new MemoryHistoryStorage(), issuers.jwks)
        net.enrol(other, "Edge on Windows")
        const asking = asker(net, phone)
        await asking.tick()
        const requestId = net.last()
        const run = await answering(net, other)

        await run.answer(shown(asking).code)

        expect(run.outcome).toEqual({ kind: "failed", reason: "not-acting" })
        expect(net.bodies(requestId).length).toBe(1)
        expect(net.requests.get(requestId)?.approver).toBeNull()
        expect(net.isOpen(requestId)).toBe(true)
    })
})

describe("the asker approving the answerer back", () => {
    /** The answerer's approval of the phone, as the instance chooses to list it. */
    async function listed(approval: (net: FakeAccount, laptop: Device, phone: Device) => DeviceListEntry["approvals"]) {
        const { laptop, phone, net } = await account()
        const approve = net.directory.approveByDevice.bind(net.directory)
        const asksPhone = vi.fn(approve)
        vi.spyOn(net.directory, "approveByDevice").mockImplementation(async (idp, token, id, signature) => {
            if (token === phone.token) return asksPhone(idp, token, id, signature)
            const row = net.rows.get(phone.storage.deviceId) as DeviceListEntry
            net.list({ ...row, approvals: approval(net, laptop, phone) })
        })
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        await exchange(asking, run)
        return { asking, run, asksPhone, phone, net }
    }

    const byLaptop = (signature: Uint8Array, laptop: Device) => [
        { by: "device" as const, device_id: laptop.storage.deviceId, signature, created_at: "2026-11-04T12:00:00Z" },
    ]

    for (const [what, approvals] of [
        ["absent", () => []],
        [
            "signed by another key",
            (_net: FakeAccount, laptop: Device, phone: Device) =>
                byLaptop(ed25519.sign(approvalBytes(ACTOR, phone.storage.deviceId, phone.storage.rootKey.publicKey), ed25519.keygen().secretKey), laptop),
        ],
        [
            "over another root key",
            (_net: FakeAccount, laptop: Device, phone: Device) =>
                byLaptop(ed25519.sign(approvalBytes(ACTOR, phone.storage.deviceId, ed25519.keygen().publicKey), laptop.storage.rootKey.secretKey), laptop),
        ],
    ] as const) {
        it(`approves nobody when the answerer's approval of it is ${what}`, async () => {
            const { asking, run, asksPhone, phone } = await listed(approvals)

            expect(run.outcome?.kind).toBe("approved")
            expect(asking.state).toEqual({ kind: "stopped", failure: "ended" })
            expect(asksPhone).not.toHaveBeenCalled()
            expect(phone.storage.trust.partners).toEqual([])
        })
    }
})

describe("the answerer's approval when the network fails", () => {
    it("keeps the asker before it posts, and posts again when the first try never reached the IdP", async () => {
        const { laptop, phone, net } = await account()
        net.failNext("approveByDevice", new Error("network down"))
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        await exchange(asking, run)

        expect(run.outcome?.kind).toBe("approved")
        expect(asking.state.kind).toBe("approved")
        expect(laptop.storage.trust.partners.map(plain)).toEqual([plain(keysOf(phone))])
    })

    it("posts again when the answer was lost after the IdP stored it, which answers the repeat 204", async () => {
        const { laptop, phone, net } = await account()
        const approve = net.directory.approveByDevice.bind(net.directory)
        let lost = 1
        vi.spyOn(net.directory, "approveByDevice").mockImplementation(async (...args) => {
            await approve(...args)
            if (args[1] === laptop.token && lost-- > 0) throw new Error("socket hang up")
        })
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        await exchange(asking, run)

        expect(run.outcome?.kind).toBe("approved")
        expect(net.approvals.filter((a) => a.approver === laptop.storage.deviceId)).toHaveLength(1)
    })

    it("holds the asker as a partner while its approval stays ambiguous, and finishes on the next call", async () => {
        const { laptop, phone, net } = await account()
        net.failNext("approveByDevice", new IdpError(503, "unavailable", "try later"), 3)
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        await asking.tick()
        await run.advance()
        await asking.tick()

        await expect(run.advance()).rejects.toThrow("try later")
        expect(run.phase).toBe("approving")
        expect(laptop.storage.trust.partners.map(plain)).toEqual([plain(keysOf(phone))])

        await run.advance()
        expect(run.outcome?.kind).toBe("approved")
    })
})

describe("the relay's own refusals", () => {
    it("asks nothing for a device with no root key, and waits", async () => {
        const { phone, net } = await account()
        net.list({ ...(net.rows.get(phone.storage.deviceId) as DeviceListEntry), drk_public_key: null })
        const asking = asker(net, phone)
        await asking.tick()
        expect(asking.state).toMatchObject({ kind: "waiting", why: "unreachable" })
        expect(net.requests.size).toBe(0)
    })

    it("lets no device without a root key answer", async () => {
        const { idp, phone, net } = await account()
        const keyless = historyDevice(idp, "keyless", new MemoryHistoryStorage(), issuers.jwks)
        net.list({ ...net.enrol(keyless, "Old laptop"), drk_public_key: null })
        vi.spyOn(keyless.e2ee, "checkHistoryKey").mockResolvedValue({ kind: "holds", generation: 1, settled: true })
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, keyless)

        await run.answer(shown(asking).code)

        expect(run.outcome).toEqual({ kind: "failed", reason: "error" })
        expect(net.requests.get(net.last())?.approver).toBeNull()
    })

    it("finishes nothing when the asker is revoked as it is about to be approved", async () => {
        const { laptop, phone, net } = await account()
        const check = laptop.e2ee.checkHandshakePeer.bind(laptop.e2ee)
        vi.spyOn(laptop.e2ee, "checkHandshakePeer").mockImplementation(async (...args) => {
            const verdict = await check(...args)
            await net.directory.markRevoked(IDP, laptop.token, phone.storage.deviceId)
            return verdict
        })
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        await exchange(asking, run)

        expect(run.outcome).toEqual({ kind: "failed", reason: "error" })
        expect(asking.state).toEqual({ kind: "stopped", failure: "error" })
        expect(net.approvals).toEqual([])
    })

    it("cuts a device revoked mid-exchange off, and its request with it", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const run = await answering(net, laptop)
        await run.answer(shown(asking).code)
        await asking.tick()

        await net.directory.markRevoked(IDP, laptop.token, laptop.storage.deviceId)
        await run.advance()
        await asking.tick()

        expect(run.outcome).toEqual({ kind: "failed", reason: "error" })
        // Its confirmation out, the asker can't tell a revoke from a wrong code.
        expect(asking.state).toEqual({ kind: "stopped", failure: "wrong-code" })
        noApprovalBetween(net, phone)
    })
})

describe("the asking device's request", () => {
    it("asks nothing from a device holding the current passphrase", async () => {
        const { laptop, net } = await account()
        const asking = asker(net, laptop)
        await asking.tick()
        expect(asking.state).toEqual({ kind: "holds" })
        expect(net.requests.size).toBe(0)
    })

    it("renews a code nobody answered once its 10 minutes ran out on this device's clock", async () => {
        const { phone, net } = await account()
        const clock = { at: net.now.at - 7 * MINUTE }
        const asking = asker(net, phone, clock)
        await asking.tick()
        const first = net.last()
        expect(shown(asking).deadline).toBe(clock.at + APPROVAL_REQUEST_LIFETIME_MS)

        clock.at += APPROVAL_REQUEST_LIFETIME_MS
        await asking.tick()

        expect(net.last()).not.toBe(first)
        expect(shown(asking)).toMatchObject({ failure: "expired", deadline: clock.at + APPROVAL_REQUEST_LIFETIME_MS })
    })

    it("never renews by itself when the relay ends its request early, nobody answering", async () => {
        const { laptop, phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const first = net.last()

        net.now.at += 3 * MINUTE
        await net.relay.close(IDP, laptop.token, first)
        await asking.tick()

        expect(asking.state).toEqual({ kind: "stopped", failure: "ended" })
        expect(net.requests.size).toBe(1)
    })

    it("asks again on each open whether it holds the passphrase", async () => {
        const { phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        vi.spyOn(phone.e2ee, "checkHistoryKey").mockResolvedValue({ kind: "holds", generation: 1, settled: true })

        net.now.at += APPROVAL_REQUEST_LIFETIME_MS
        await asking.tick()

        expect(asking.state).toEqual({ kind: "holds" })
        expect(net.requests.size).toBe(1)
    })

    it("backs off when the relay fails, and slows right down on a 429", async () => {
        const { phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        expect(asking.nextDelay()).toBe(3_000)

        net.failNext("read", new IdpError(503, "unavailable", "unavailable"))
        await expect(asking.tick()).rejects.toThrow()
        expect(shown(asking).phase).toBe("waiting")
        expect(asking.nextDelay()).toBe(6_000)

        net.failNext("read", new IdpError(429, "too_many_requests", "slow down"))
        await expect(asking.tick()).rejects.toThrow()
        expect(asking.nextDelay()).toBe(RATE_LIMITED_RETRY_MS)

        await asking.tick()
        expect(asking.nextDelay()).toBe(3_000)
    })

    it("runs one tick at a time", async () => {
        const { phone, net } = await account()
        const asking = asker(net, phone)
        await Promise.all([asking.tick(), asking.tick(), asking.tick()])
        expect(net.requests.size).toBe(1)
    })

    it("waits out the relay's 429 on opening, then asks again", async () => {
        const { phone, net } = await account()
        for (let i = 0; i < 10; i++) net.opened.push(net.now.at - i * MINUTE)
        const asking = asker(net, phone)

        await asking.tick()
        expect(asking.state).toEqual({ kind: "waiting", until: net.now.at + 5 * MINUTE, why: "limit", failure: null })

        const tries = vi.spyOn(net.relay, "openRequest")
        net.now.at += 4 * MINUTE
        await asking.tick()
        expect(tries).not.toHaveBeenCalled()

        net.opened.length = 0
        net.now.at += 2 * MINUTE
        await asking.tick()
        expect(asking.state.kind).toBe("showing")
    })

    it("keeps under its own budget across remounts: the ninth code in an hour waits for the oldest to turn an hour old", async () => {
        const { laptop, phone, net } = await account()
        const opened: number[] = []
        const start = net.now.at
        let asking = asker(net, phone, undefined, opened)
        await asking.tick()
        for (let i = 1; i < ASKER_REQUESTS_PER_HOUR; i++) {
            net.now.at += MINUTE
            await net.relay.close(IDP, laptop.token, net.last())
            await asking.tick()
            await asking.stop()
            asking = asker(net, phone, undefined, opened)
            await asking.again()
        }
        expect(net.requests.size).toBe(ASKER_REQUESTS_PER_HOUR)

        net.now.at += MINUTE
        await net.relay.close(IDP, laptop.token, net.last())
        await asking.tick()
        await asking.again()

        expect(asking.state).toEqual({ kind: "waiting", until: start + 60 * MINUTE, why: "limit", failure: "ended" })
        expect(net.requests.size).toBe(ASKER_REQUESTS_PER_HOUR)
    })

    it("ends its request when it stops, after a sign-out too", async () => {
        const { phone, net } = await account()
        let token: string | null = phone.token
        const asking = new ApprovalAsking(net.deps(phone), { ...net.context(phone), accessToken: () => token })
        await asking.tick()
        token = null
        await asking.stop({ keepalive: true })
        expect(net.isOpen(net.last())).toBe(false)
    })

    it("leaves nothing open when it stops while a request opens", async () => {
        const { phone, net } = await account()
        const asking = asker(net, phone)
        const ticking = asking.tick()
        await asking.stop()
        await ticking
        expect([...net.requests.keys()].filter((id) => net.isOpen(id))).toEqual([])
    })

    it("ends its request when the page sets it aside, and asks again only when the user does", async () => {
        const { phone, net } = await account()
        const asking = asker(net, phone)
        await asking.tick()
        const first = net.last()

        await asking.pause()
        await asking.tick()
        expect(asking.state).toEqual({ kind: "paused" })
        expect(net.isOpen(first)).toBe(false)
        expect(net.requests.size).toBe(1)

        await asking.again()
        expect(net.isOpen(net.last())).toBe(true)
        expect(net.last()).not.toBe(first)
    })
})
