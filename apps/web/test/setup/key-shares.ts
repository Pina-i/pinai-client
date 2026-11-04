import { verifyStrict } from "@pinai/crypto/attestation-chain.adapter"
import { approvalBytes, shareAad, shareSignedBytes } from "@pinai/crypto/canonical-bytes"
import { MlsAdapter } from "@pinai/mls/wasm.adapter"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { KeyShare, OutgoingKeyShare } from "@pinai/domain/models/key-share"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"
import type { IKeySharePort } from "@pinai/domain/ports/key-share.port"

import { archivedText } from "@pinai/domain/models/history-archive"
import type { IHpkePort } from "@pinai/domain/ports/hpke.port"
import {
    ApprovalAsking,
    answeringRun,
    type HandshakeDeps,
} from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { setUpThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-this-device.usecase"
import { shareHistoryKeyUseCase } from "@pinai/domain/usecases/e2ee/share-history-key.usecase"

import { FakeAccount } from "./approval-relay"
import { ACTOR, FakeHistoryIdp, IDP, MemoryHistoryStorage, historyDevice } from "./history-idp"
import type { FakeIssuers } from "./issuers"
import { loadWasmModule } from "./wasm"

const refusal = (status: number, code: string) => new IdpError(status, code, code)

/** The bundle's HPKE, loaded once for every device of a spec: it keeps no state. */
export async function bundleHpke(): Promise<MlsAdapter> {
    const hpke = new MlsAdapter()
    await hpke.initialize({ module_or_path: await loadWasmModule() } as never)
    return hpke
}

interface HeldShare {
    sender: string
    share: OutgoingKeyShare
    createdAt: string
    /** The keys it was stored over: a change of any deletes it, as § 3.11's table says. */
    senderRoot: Uint8Array
    recipientRoot: Uint8Array
    recipientHpke: Uint8Array
}

const same = (a: Uint8Array | null, b: Uint8Array) => !!a && a.length === b.length && a.every((byte, i) => byte === b[i])

/**
 * `/api/history/key-shares` as the IdP answers it (`identity-provider/specs/e2ee.md § 3.11`, § 5),
 * over the relay's device list and the history IdP's key: every refusal of `may_share` by its code,
 * in its order, approvals matched by device and the root key they bind, as `key_share.rs` does; one
 * share per recipient and generation, the first kept, another `204`; a new one pushing
 * `history_key_ready` to its recipient. A share goes with a revoke, a root key rotated on either
 * side, or the recipient's HPKE key replaced. `directory()` is the list both keep: a passphrase
 * approval and a report land in the rows, a report deleting the device's share.
 */
export class FakeKeyShares implements IKeySharePort {
    private readonly stored = new Map<string, HeldShare>()
    /** Every share that reached the route, refused or not. */
    readonly posted: Array<{ sender: string; recipient: string; generation: number }> = []
    /** `history_key_ready`, by recipient device. */
    readonly pushes: string[] = []
    private readonly refusals: Error[] = []
    private readonly idp: FakeHistoryIdp
    private readonly net: FakeAccount

    constructor(idp: FakeHistoryIdp, net: FakeAccount) {
        this.idp = idp
        this.net = net
    }

    /** The share held for `recipient`, once what deletes it is applied. */
    held(recipient: string): HeldShare | null {
        const held = this.stored.get(recipient)
        if (!held) return null
        const from = this.net.rows.get(held.sender)
        const to = this.net.rows.get(recipient)
        const valid =
            !!from &&
            !!to &&
            from.revoked_at === null &&
            to.revoked_at === null &&
            same(from.drk_public_key, held.senderRoot) &&
            same(to.drk_public_key, held.recipientRoot) &&
            same(to.hpke_public_key, held.recipientHpke)
        if (!valid) this.stored.delete(recipient)
        return valid ? held : null
    }

    /** The next shares posted are refused so. */
    refuseNext(error: Error, times = 1): void {
        for (let i = 0; i < times; i++) this.refusals.push(error)
    }

    async share(_idpUrl: string, token: string, share: OutgoingKeyShare): Promise<void> {
        const sender = this.net.deviceOf(token)
        if (!sender) throw refusal(403, "device_required")
        this.posted.push({ sender, recipient: share.recipientDeviceId, generation: share.generation })
        const refused = this.refusals.shift()
        if (refused) throw refused
        const rows = this.net.rows
        if (share.recipientDeviceId === sender) throw refusal(400, "invalid_request")
        const recipient = rows.get(share.recipientDeviceId)
        const from = rows.get(sender) as DeviceListEntry
        if (!recipient) throw refusal(404, "not_found")
        if (from.revoked_at || recipient.revoked_at) throw refusal(403, "access_denied")
        const generation = this.idp.key?.generation ?? null
        if (generation === null || share.generation !== generation) throw refusal(409, "stale_history_key")
        if (!from.drk_public_key) throw refusal(409, "no_root_key")
        if (from.history_generation !== generation) throw refusal(409, "history_key_not_held")
        if (!this.approvedUnder(from, generation)) throw refusal(409, "not_approved")
        if (!recipient.drk_public_key) throw refusal(409, "no_root_key")
        if (!recipient.hpke_public_key) throw refusal(409, "no_hpke_key")
        if (!this.approvedUnder(recipient, generation)) throw refusal(409, "not_approved")
        if (!this.byDevice(recipient, sender)) throw refusal(409, "not_the_approver")
        if (recipient.history_generation === generation) throw refusal(409, "history_key_held")
        const signed = shareSignedBytes(shareAad(ACTOR, sender, share.recipientDeviceId, generation), share.enc, share.ciphertext)
        if (!verifyStrict(share.signature, signed, from.drk_public_key)) throw refusal(400, "invalid_request")
        const held = this.held(share.recipientDeviceId)
        if (held && held.share.generation === generation) return
        this.stored.set(share.recipientDeviceId, {
            sender,
            share,
            createdAt: new Date().toISOString(),
            senderRoot: from.drk_public_key,
            recipientRoot: recipient.drk_public_key,
            recipientHpke: recipient.hpke_public_key,
        })
        this.pushes.push(share.recipientDeviceId)
    }

    async waiting(_idpUrl: string, token: string): Promise<KeyShare | null> {
        const device = this.net.deviceOf(token)
        if (!device) throw refusal(403, "device_required")
        const held = this.held(device)
        if (!held || held.share.generation !== this.idp.key?.generation) return null
        const { enc, ciphertext, signature, generation } = held.share
        return { senderDeviceId: held.sender, generation, enc, ciphertext, signature, createdAt: held.createdAt }
    }

    /** A share the instance put there itself, as it would serve it. */
    plant(recipient: string, share: KeyShare): void {
        const { senderDeviceId, createdAt, ...sealed } = share
        const to = this.net.rows.get(recipient) as DeviceListEntry
        this.stored.set(recipient, {
            sender: senderDeviceId,
            share: { ...sealed, recipientDeviceId: recipient },
            createdAt,
            senderRoot: this.net.rows.get(senderDeviceId)?.drk_public_key ?? new Uint8Array(32),
            recipientRoot: to.drk_public_key as Uint8Array,
            recipientHpke: to.hpke_public_key as Uint8Array,
        })
    }

    directory(): IDeviceDirectoryPort {
        const history = this.idp.directory()
        return {
            ...this.net.directory,
            approveByPassphrase: async (idpUrl, token, deviceId, generation, signature) => {
                await history.approveByPassphrase(idpUrl, token, deviceId, generation, signature)
                const row = this.net.rows.get(deviceId) as DeviceListEntry
                const created_at = new Date().toISOString()
                row.approvals = [...row.approvals.filter((a) => a.by !== "passphrase"), { by: "passphrase", generation, signature, created_at }]
            },
            reportHistoryKey: async (idpUrl, token, deviceId, generation) => {
                await history.reportHistoryKey(idpUrl, token, deviceId, generation)
                const row = this.net.rows.get(deviceId) as DeviceListEntry
                row.history_generation = generation
                this.stored.delete(deviceId)
            },
        }
    }

    /** A `by: device` approval of `row` by `approver`, binding the root key `row` holds: its signature verifies over it. */
    private byDevice(row: DeviceListEntry, approver: string): boolean {
        const signer = this.net.rows.get(approver)?.drk_public_key
        const bytes = row.drk_public_key && approvalBytes(ACTOR, row.device_id, row.drk_public_key)
        return !!signer && !!bytes && row.approvals.some((a) => a.by === "device" && a.device_id === approver && verifyStrict(a.signature, bytes, signer))
    }

    /** `approval_chain`: a passphrase approval under `generation` binding its root key, or one by an unrevoked device carrying one. */
    private approvedUnder(row: DeviceListEntry, generation: number): boolean {
        const key = this.idp.key?.approvalPublicKey
        const byPassphrase = (r: DeviceListEntry) => {
            const bytes = r.drk_public_key && approvalBytes(ACTOR, r.device_id, r.drk_public_key)
            return !!key && !!bytes && r.approvals.some((a) => a.by === "passphrase" && a.generation === generation && verifyStrict(a.signature, bytes, key))
        }
        if (byPassphrase(row)) return true
        return row.approvals.some((a) => {
            if (a.by !== "device") return false
            const approver = this.net.rows.get(a.device_id)
            return !!approver && approver.revoked_at === null && byPassphrase(approver) && this.byDevice(row, a.device_id)
        })
    }
}

export const CONVERSATION = "11112222-3333-4444-5555-666677778888"
const SENDER = { address: "alice@idp.test", displayName: "Alice" }
const entryId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

/**
 * An account whose devices share the passphrase over the fakes above, each the real E2EE engine
 * with the bundle's HPKE: a laptop that founded generation 1, and a phone signed in, set up, named,
 * holding nothing. `device` makes another; `handshake` runs the code handshake between two, the
 * answerer sharing right after unless told not to.
 */
export async function sharingAccount(hpke: IHpkePort, issuers: FakeIssuers) {
    const idp = new FakeHistoryIdp()
    const net = new FakeAccount(issuers)
    const shares = new FakeKeyShares(idp, net)
    const device = (name: string, storage = new MemoryHistoryStorage()) => {
        const made = historyDevice(idp, name, storage, issuers.jwks, null, hpke)
        return { ...made, deps: { ...made.deps, deviceDirectoryPort: shares.directory(), keySharePort: shares } }
    }
    type Device = ReturnType<typeof device>
    const enrolled = async (name: string, label: string) => {
        const made = device(name)
        net.enrol(made, label)
        await setUpThisDeviceUseCase(made.deps)(IDP, made.token, ACTOR)
        return made
    }
    const laptop = await enrolled("laptop", "Firefox on Linux")
    const founded = await bootstrapFirstDeviceUseCase(laptop.deps)({ idpUrl: IDP, accessToken: laptop.token, actorUri: ACTOR })
    if (founded.kind !== "holds") throw new Error("the first device didn't set the key")
    const phone = await enrolled("phone", "Chrome on Android")

    const sharing = (d: Device) => ({ e2ee: d.e2ee, keyShares: shares, deviceDirectory: shares.directory() })
    const handshakeDeps = (d: Device, shares: boolean): HandshakeDeps => ({
        e2ee: d.e2ee,
        relay: net.relay,
        directory: sharing(d).deviceDirectory,
        ...(shares ? { sharing: sharing(d) } : {}),
    })
    /** `leavesEarly`: the asking tab closes once its keys are sent, before it approves back. */
    const handshake = async (asking: Device, answering: Device, options: { sharing?: boolean; leavesEarly?: boolean } = {}) => {
        const asker = new ApprovalAsking(handshakeDeps(asking, false), net.context(asking))
        // Read through a call: the checker would keep a narrowing across the awaits.
        const state = () => asker.state
        await asker.tick()
        const open = await net.relay.openRequests(IDP, answering.token)
        const request = open.find((r) => r.deviceId === asking.storage.deviceId)
        const shown = state()
        if (!request || shown.kind !== "showing") throw new Error("no request to answer")
        const run = answeringRun(handshakeDeps(answering, options.sharing ?? true), net.context(answering), request, answering.storage.deviceId)
        await run.answer(shown.code)
        for (let i = 0; i < 8 && !(state().kind === "approved" && run.outcome); i++) {
            if (options.leavesEarly && run.outcome) break
            await asker.tick()
            await run.advance()
        }
        if (options.leavesEarly) {
            if (run.outcome?.kind !== "approved" || state().kind === "approved") throw new Error("the asker didn't leave before approving back")
            return
        }
        if (state().kind !== "approved" || run.outcome?.kind !== "approved") throw new Error("the handshake didn't approve both ways")
    }
    /** `texts` archived by `by`, under generation it holds. */
    const archive = async (by: Device, texts: string[]) => {
        by.e2ee.startFlushing(IDP, () => by.token)
        texts.forEach((text, n) =>
            by.e2ee.bufferForArchive(CONVERSATION, entryId(n + 1), archivedText(SENDER, `2026-11-01T10:00:0${n}Z`, { text }, undefined)),
        )
        await by.e2ee["flushArchiveNow"]()
        by.e2ee.stopFlushing()
    }
    /** What `device_approved` brings an acting device to: the list read again and shared over. */
    const refresh = (d: Device) => shareHistoryKeyUseCase(sharing(d))(IDP, d.token, ACTOR)
    return { idp, net, shares, laptop, phone, words: founded.words, device, enrolled, sharing, handshake, refresh, archive }
}

export type SharingAccount = Awaited<ReturnType<typeof sharingAccount>>
export type SharingDevice = SharingAccount["laptop"]
