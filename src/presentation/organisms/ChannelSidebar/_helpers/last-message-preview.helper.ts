import type { Message } from "@/lib/types"

/** Sidebar preview from a 1:1's latest *decrypted* message; `null` when nothing
 *  is cached (E2EE — we can only preview what we've already decrypted). */
export function lastMessagePreview(
    messages: Message[] | undefined,
    myAddress: string | undefined,
): string | null {
    const last = messages?.[messages.length - 1]
    if (!last) return null

    let text = last.content?.trim()
    if (!text) {
        if (last.attachments && last.attachments.length > 0) text = "Attachment"
        else return null
    }

    const isOwn = !!myAddress && last.authorAddress === myAddress
    return isOwn ? `You: ${text}` : text
}
