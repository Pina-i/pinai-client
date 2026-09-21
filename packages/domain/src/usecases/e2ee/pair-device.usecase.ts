import type { ActorUri, DeviceId, Fingerprint } from "../../models/e2ee"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface PairDeviceTransport {
    /** Send our outbound message to the peer; resolve on send. */
    send(message: Uint8Array): Promise<void>
    /** Block until the next inbound message arrives. */
    receive(): Promise<Uint8Array>
}

export interface PairDeviceDeps {
    e2eePort: IE2eePort
}

export interface StartPairingInput {
    /**
     * Transport that ferries SPAKE2 messages between the two devices.
     * Phase 6 wires this to either an IdP relay endpoint or a
     * WebRTC/QR-bidirectional channel; the use case is transport-
     * agnostic.
     */
    transport: PairDeviceTransport
}

export interface CompletePairingInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
    /** The QR payload string the new device just scanned. */
    qrPayload: string
    transport: PairDeviceTransport
}

/**
 * "Existing device" path. Builds a QR, sends the SPAKE2 message,
 * waits for the responder, finalises, and returns when the new
 * device has the bundle. Caller surfaces the QR payload to the UI
 * before awaiting — see Phase 6.
 *
 * Wire format (over the transport):
 *   1. Initiator → Responder: SPAKE2 message (32 B)
 *   2. Responder → Initiator: SPAKE2 message (32 B) + confirmation (32 B)
 *   3. Initiator → Responder: confirmation (32 B) + sealed bundle (variable)
 */
export const startPairingAsInitiatorUseCase =
    ({ e2eePort }: PairDeviceDeps) =>
    async (input: StartPairingInput): Promise<{ qr_payload: string }> => {
        const initiator = await e2eePort.startPairingAsInitiator()

        await input.transport.send(initiator.spake_message)
        const round1 = await input.transport.receive()
        if (round1.length !== 64) {
            throw new Error(`Pairing round 1: expected 64 bytes, got ${round1.length}`)
        }
        const responderMessage = round1.slice(0, 32)
        const responderConfirmation = round1.slice(32, 64)

        const reply = await initiator.finalize(responderMessage, responderConfirmation)
        const round2 = new Uint8Array(reply.our_confirmation.length + reply.sealed_bundle.length)
        round2.set(reply.our_confirmation, 0)
        round2.set(reply.sealed_bundle, reply.our_confirmation.length)
        await input.transport.send(round2)

        return { qr_payload: initiator.qr_payload }
    }

/**
 * "New device" path. Caller passes the scanned QR + a transport
 * already linked to the existing device. Use case drives the
 * SPAKE2 dance, decrypts the bundle, persists it, and seeds the
 * IdP key directory.
 */
export const pairAsResponderUseCase =
    ({ e2eePort }: PairDeviceDeps) =>
    async (
        input: CompletePairingInput,
    ): Promise<{ device_id: DeviceId; fingerprint: Fingerprint }> => {
        const initiatorSpake = await input.transport.receive()
        if (initiatorSpake.length !== 32) {
            throw new Error(`Pairing round 0: expected 32-byte SPAKE2 message, got ${initiatorSpake.length}`)
        }
        const responder = await e2eePort.pairAsResponder(
            input.idpUrl,
            input.accessToken,
            input.actorUri,
            input.qrPayload,
            initiatorSpake,
        )
        const round1 = new Uint8Array(responder.spake_message.length + responder.our_confirmation.length)
        round1.set(responder.spake_message, 0)
        round1.set(responder.our_confirmation, responder.spake_message.length)
        await input.transport.send(round1)

        const round2 = await input.transport.receive()
        if (round2.length <= 32) {
            throw new Error(`Pairing round 2: expected confirmation + sealed bundle, got ${round2.length} bytes`)
        }
        const initiatorConfirmation = round2.slice(0, 32)
        const sealedBundle = round2.slice(32)
        return responder.finalize(initiatorConfirmation, sealedBundle)
    }
