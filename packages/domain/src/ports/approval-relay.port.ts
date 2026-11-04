import type { ApprovalRequest, RelayMessage } from "../models/approval-handshake"

/**
 * The approval requests the IdP relays between two devices of the account
 * (`identity-provider/specs/e2ee.md § 3.10`, § 5 "Approvals"). Refusals are `IdpError`s, told
 * apart by their code: `approval_request_taken`, `approval_request_ended`, `approval_request_full`,
 * `too_many_requests`, `no_root_key`, `device_required`.
 */
export interface IApprovalRelayPort {
    /** The session's device asks to be approved: its open request, if any, is closed. */
    openRequest(idpUrl: string, accessToken: string): Promise<{ id: string; expiresAt: string }>
    /** The account's open requests, oldest first. */
    openRequests(idpUrl: string, accessToken: string): Promise<ApprovalRequest[]>
    /** An opaque body, 1–4096 bytes; the first from a device other than the asking one binds the request to it. */
    post(idpUrl: string, accessToken: string, requestId: string, body: Uint8Array): Promise<number>
    /** The messages after `after`, in order, but the caller's own. */
    read(idpUrl: string, accessToken: string, requestId: string, after: number): Promise<RelayMessage[]>
    /** Either side ends the request; `keepalive` lets it outlive the page that sends it. */
    close(idpUrl: string, accessToken: string, requestId: string, options?: { keepalive?: boolean }): Promise<void>
}
