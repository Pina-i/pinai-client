import { MessageSquareOff } from "lucide-react"

/** A route naming a conversation the user has none of, which only an address could start. */
export function ConversationUnavailable() {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquareOff aria-hidden className="h-6 w-6" />
            <span className="text-[13.5px]">This conversation isn't available</span>
        </div>
    )
}
