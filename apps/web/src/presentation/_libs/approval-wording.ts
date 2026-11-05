import type { AnsweringView, HandshakeFailure } from "@pinai/domain/models/approval-handshake"

/** What a failed exchange tells the user, at the Door or in a waiting seat; nothing was approved in any of them. */
export function failureWording(reason: HandshakeFailure, device: string): string {
    switch (reason) {
        case "wrong-code":
            return `That code didn't match. A wrong code ends the request: ${device} shows a new one.`
        case "tampered":
            return "Something changed the messages between your devices. Nothing was approved."
        case "keys-refused":
            return `${device}'s keys aren't the ones your instance lists for it. Nothing was approved.`
        case "not-acting":
            return "This device can't approve others right now: it doesn't hold your account's current history passphrase."
        case "ended":
        case "expired":
            return "The request ended before it was done. Nothing was approved."
        default:
            return `This didn't finish. Nothing was approved — ask again from ${device}.`
    }
}

export function refusalWording(refused: AnsweringView["refused"]): string | null {
    if (refused === "used-code") return "That code was tried already — type the new one it shows."
    if (refused === "other-tab") return "Another tab is answering this request."
    return null
}
