import type { IWsPort } from "@/domain/ports/ws.port"

export function sendDmWsUseCase(
    recipientAddress: string,
    content: string,
    wsPort: IWsPort,
): void {
    const trimmed = content.trim()
    if (!trimmed) throw new Error("Message content cannot be empty")
    if (trimmed.length > 4096) throw new Error("Message content too long (max 4096 chars)")

    wsPort.send({
        type: "send_dm",
        data: { recipient_address: recipientAddress, content: trimmed },
    })
}
