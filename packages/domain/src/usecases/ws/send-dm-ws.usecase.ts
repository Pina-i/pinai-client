import type { IWsPort } from "../../ports/ws.port"

/**
 * Send a pre-encrypted MLS application message over the WebSocket.
 * The caller is responsible for encrypting plaintext via
 * `IE2eePort.encryptOutbound` before invoking — this use case only
 * wraps the wire envelope.
 *
 * `mlsCiphertext` is base64; the server validates ≤ 64 KiB.
 */
export function sendDmWsUseCase(
    recipientAddress: string,
    mlsCiphertext: string,
    wsPort: IWsPort,
    clientId?: string,
): void {
    if (!mlsCiphertext) throw new Error("MLS ciphertext is empty")

    wsPort.send({
        type: "send_dm",
        data: { recipient_address: recipientAddress, mls_ciphertext: mlsCiphertext, client_id: clientId },
    })
}
