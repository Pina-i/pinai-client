import type { ReceivedText } from "@pinai/domain/models/received-message"
import type { Message } from "@/lib/types"

/** A received message as the web's timeline draws it. */
export function timelineMessage(text: ReceivedText): Message {
    return {
        ...text,
        avatar: text.author.slice(0, 2).toUpperCase(),
        timestamp: new Date(text.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        color: "#a78bfa",
    }
}
