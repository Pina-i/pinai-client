import { ed25519 } from "@noble/curves/ed25519.js"

import { verifyStrict } from "@pinai/crypto/attestation-chain.adapter"
import { approvalBytes, deviceHpkeKeyBytes } from "@pinai/crypto/canonical-bytes"
import type { ApprovalRequest, RelayMessage } from "@pinai/domain/models/approval-handshake"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { IApprovalRelayPort } from "@pinai/domain/ports/approval-relay.port"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"
import type { HandshakeContext, HandshakeDeps } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"

import { ACTOR, IDP, type historyDevice } from "./history-idp"
import type { FakeIssuers } from "./issuers"

type Device = ReturnType<typeof historyDevice>

const LIFETIME_MS = 10 * 60_000
const HOUR_MS = 60 * 60_000

interface HeldRequest {
    id: string
    asker: string
    approver: string | null
    createdAt: number
    expiresAt: number
    closed: boolean
    messages: Array<{ seq: number; deviceId: string; body: Uint8Array }>
}

export type Push = { type: "approval_requested" | "approval_message" | "approval_closed"; requestId: string; to: string[] }

export type Route = "openRequest" | "openRequests" | "post" | "read" | "close" | "listDevices" | "approveByDevice"

/** A clock a test moves by hand. */
export interface Clock {
    at: number
}

/**
 * The account's devices, approvals and approval requests as the IdP keeps them
 * (`identity-provider/specs/e2ee.md § 3.10`, § 5 "Approvals"), on the IdP's own clock (`now`):
 * each session's token names its device; a revoked device is refused (`403`), one with no root key
 * can't ask nor answer (`409 no_root_key`); a request lives 10 minutes, 10 an account an hour; the
 * first other device to post binds it, a third is `409 approval_request_taken`; an ended request
 * takes no post nor close (`410`); 12 messages of 1–4096 bytes. An approval by a device is checked
 * over the listed root keys, never of itself, never by or of a revoked device. `failNext` makes a
 * route fail, as a network or a `5xx` would; `tamper` and `poster` rewrite what it carries.
 */
export class FakeAccount {
    readonly now: Clock
    readonly requests = new Map<string, HeldRequest>()
    /** When each request was opened, the account's other devices' included. */
    readonly opened: number[] = []
    readonly pushes: Push[] = []
    readonly rows = new Map<string, DeviceListEntry>()
    /** What reached the IdP's approvals route and was stored, in order. */
    readonly approvals: Array<{ approver: string; approved: string }> = []
    /** Every call, `route:device`, in order. */
    readonly calls: string[] = []
    /** Rewrites a body as it is stored: a relay that tampers. */
    tamper: ((body: Uint8Array, from: string, requestId: string) => Uint8Array) | null = null
    /** Names another poster for a message as it is read. */
    poster: ((message: { seq: number; deviceId: string }, requestId: string) => string) | null = null
    private readonly failures: Array<{ route: Route; error: Error }> = []
    private readonly tokens = new Map<string, string>()
    private readonly issuers: FakeIssuers

    constructor(issuers: FakeIssuers, at = Date.now()) {
        this.issuers = issuers
        this.now = { at }
    }

    /** `device` registered and named on its session, listed as the IdP lists it. */
    enrol(device: Device, name: string): DeviceListEntry {
        const { deviceId, rootKey, hpkeKey } = device.storage
        this.tokens.set(device.token, deviceId)
        const attestation = this.issuers.attest(ACTOR, deviceId, rootKey.publicKey)
        const row: DeviceListEntry = {
            device_id: deviceId,
            display_name: name,
            kind: "laptop",
            paired_at: new Date(this.now.at - 120_000).toISOString(),
            last_seen_at: new Date(this.now.at).toISOString(),
            revoked_at: null,
            signed_in: true,
            last_active_at: null,
            drk_public_key: rootKey.publicKey,
            attestation_signature: attestation.signature,
            attestation_kid: attestation.kid,
            attestation_expires_at: attestation.expires_at,
            hpke_public_key: hpkeKey.publicKey,
            hpke_key_signature: ed25519.sign(deviceHpkeKeyBytes(ACTOR, deviceId, hpkeKey.publicKey), rootKey.secretKey),
            history_generation: null,
            approvals: [],
        }
        this.rows.set(deviceId, row)
        return row
    }

    /** The list as the instance chooses to show it. */
    list(row: DeviceListEntry): void {
        this.rows.set(row.device_id, row)
    }

    /** The next calls of `route` fail so, as an instance out of reach or a `5xx` would. */
    failNext(route: Route, error: Error, times = 1): void {
        for (let i = 0; i < times; i++) this.failures.push({ route, error })
    }

    deps(device: Device): HandshakeDeps {
        return { e2ee: device.e2ee, relay: this.relay, directory: this.directory }
    }

    /** A device's view of the account, on its own clock: the IdP's unless given another. */
    context(device: Device, clock: Clock = this.now): HandshakeContext {
        return { idpUrl: IDP, actorUri: ACTOR, accessToken: () => device.token, now: () => clock.at }
    }

    readonly relay: IApprovalRelayPort = {
        openRequest: async (_idp, token) => {
            const asker = this.device(token, "openRequest")
            if (this.opened.filter((at) => at > this.now.at - HOUR_MS).length >= 10) {
                throw new IdpError(429, "too_many_requests", "Too many approval requests")
            }
            if (!this.rows.get(asker)?.drk_public_key) throw new IdpError(409, "no_root_key", "This device has no root key")
            for (const held of this.requests.values()) {
                if (held.asker === asker && !this.ended(held)) this.end(held)
            }
            const id = crypto.randomUUID()
            this.opened.push(this.now.at)
            this.requests.set(id, {
                id,
                asker,
                approver: null,
                createdAt: this.now.at,
                expiresAt: this.now.at + LIFETIME_MS,
                closed: false,
                messages: [],
            })
            this.pushes.push({ type: "approval_requested", requestId: id, to: this.others(asker) })
            return { id, expiresAt: new Date(this.now.at + LIFETIME_MS).toISOString() }
        },
        openRequests: async (_idp, token) => {
            this.device(token, "openRequests")
            return [...this.requests.values()].filter((r) => !this.ended(r)).map((r) => this.view(r))
        },
        post: async (_idp, token, requestId, body) => {
            const device = this.device(token, "post")
            const held = this.side(requestId, device)
            if (this.ended(held)) throw ended()
            if (body.length < 1 || body.length > 4096) throw new IdpError(400, "invalid_request", "A body is 1 to 4096 bytes")
            if (held.messages.length >= 12) throw new IdpError(409, "approval_request_full", "This request holds its 12 messages")
            if (device !== held.asker && held.approver === null) {
                if (!this.rows.get(device)?.drk_public_key) throw new IdpError(409, "no_root_key", "This device has no root key")
                held.approver = device
                const left = this.others(held.asker).filter((d) => d !== device)
                this.pushes.push({ type: "approval_closed", requestId, to: left })
            }
            const seq = held.messages.length + 1
            held.messages.push({ seq, deviceId: device, body: this.tamper ? this.tamper(body, device, requestId) : body })
            const to = device === held.asker ? (held.approver ? [held.approver] : this.others(held.asker)) : [held.asker]
            this.pushes.push({ type: "approval_message", requestId, to })
            return seq
        },
        read: async (_idp, token, requestId, after) => {
            const device = this.device(token, "read")
            const held = this.side(requestId, device)
            const isSide = device === held.asker || device === held.approver
            if (!isSide && this.ended(held)) throw ended()
            return held.messages
                .filter((m) => m.seq > after && m.deviceId !== device)
                .map(
                    (m): RelayMessage => ({
                        seq: m.seq,
                        deviceId: this.poster ? this.poster(m, requestId) : m.deviceId,
                        body: m.body.slice(),
                        createdAt: new Date(this.now.at).toISOString(),
                    }),
                )
        },
        close: async (_idp, token, requestId) => {
            const device = this.device(token, "close")
            const held = this.side(requestId, device)
            if (this.ended(held)) throw ended()
            this.end(held)
        },
    }

    readonly directory: IDeviceDirectoryPort = {
        listDevices: async (_idp, token) => {
            this.device(token, "listDevices")
            return { devices: [...this.rows.values()].map((row) => ({ ...row, approvals: [...row.approvals] })) }
        },
        markRevoked: async (_idp, _token, deviceId) => {
            const row = this.rows.get(deviceId)
            if (row) this.rows.set(deviceId, { ...row, revoked_at: new Date(this.now.at).toISOString() })
            for (const held of this.requests.values()) {
                if ((held.asker === deviceId || held.approver === deviceId) && !this.ended(held)) this.end(held)
            }
        },
        approveByPassphrase: async () => undefined,
        approveByDevice: async (_idp, token, deviceId, signature) => {
            const approver = this.device(token, "approveByDevice")
            if (approver === deviceId) throw new IdpError(400, "invalid_request", "A device approves another device")
            const approverRow = this.rows.get(approver)
            const approvedRow = this.rows.get(deviceId)
            if (!approvedRow) throw new IdpError(404, "not_found", "No such device")
            if (approvedRow.revoked_at !== null) throw new IdpError(403, "access_denied", "That device is revoked")
            if (!approverRow?.drk_public_key || !approvedRow.drk_public_key) throw new IdpError(409, "no_root_key", "No root key")
            if (!verifyStrict(signature, approvalBytes(ACTOR, deviceId, approvedRow.drk_public_key), approverRow.drk_public_key)) {
                throw new IdpError(400, "invalid_request", "signature does not verify over the device's root key")
            }
            if (!approvedRow.approvals.some((a) => a.by === "device" && a.device_id === approver)) {
                this.approvals.push({ approver, approved: deviceId })
                approvedRow.approvals.push({ by: "device", device_id: approver, signature, created_at: new Date(this.now.at).toISOString() })
            }
        },
        reportHistoryKey: async () => undefined,
    }

    /** The bodies a request carried, in order. */
    bodies(requestId: string): Uint8Array[] {
        return this.requests.get(requestId)?.messages.map((m) => m.body) ?? []
    }

    isOpen(requestId: string): boolean {
        const held = this.requests.get(requestId)
        return !!held && !this.ended(held)
    }

    /** The request opened last. */
    last(): string {
        return [...this.requests.keys()].at(-1) as string
    }

    private device(token: string, route: Route): string {
        const device = this.tokens.get(token)
        if (!device) throw new IdpError(403, "device_required", "Name this session's device first")
        this.calls.push(`${route}:${device}`)
        const failure = this.failures.findIndex((f) => f.route === route)
        if (failure >= 0) throw this.failures.splice(failure, 1)[0].error
        if (this.rows.get(device)?.revoked_at) throw new IdpError(403, "access_denied", "This device is revoked")
        return device
    }

    private side(requestId: string, device: string): HeldRequest {
        const held = this.requests.get(requestId)
        if (!held) throw new IdpError(404, "not_found", "No such request")
        if (held.approver !== null && device !== held.asker && device !== held.approver) {
            throw new IdpError(409, "approval_request_taken", "Another device answered this request")
        }
        return held
    }

    private ended(held: HeldRequest): boolean {
        return held.closed || this.now.at >= held.expiresAt
    }

    private end(held: HeldRequest): void {
        held.closed = true
        const to = held.approver ? [held.asker, held.approver] : [held.asker, ...this.others(held.asker)]
        this.pushes.push({ type: "approval_closed", requestId: held.id, to })
    }

    private others(device: string): string[] {
        return [...this.rows.keys()].filter((d) => d !== device)
    }

    private view(held: HeldRequest): ApprovalRequest {
        return {
            id: held.id,
            deviceId: held.asker,
            displayName: this.rows.get(held.asker)?.display_name ?? "",
            approverDeviceId: held.approver,
            createdAt: new Date(held.createdAt).toISOString(),
            expiresAt: new Date(held.expiresAt).toISOString(),
        }
    }
}

function ended(): IdpError {
    return new IdpError(410, "approval_request_ended", "This request has ended")
}
