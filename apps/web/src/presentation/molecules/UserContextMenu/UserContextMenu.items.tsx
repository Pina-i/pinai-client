import { BellOff, Copy, MessageSquare, Phone, ShieldCheck, User, UserMinus, Video } from "lucide-react"
import type { ContextMenuItem } from "@/presentation/molecules/ContextMenu/ContextMenuList"

const iconClass = "h-4 w-4"

export interface UserContextMenuHandlers {
    onMessage?: () => void
    onProfile?: () => void
    onRemove?: () => void
    /** Hides "Remove friend" for someone who isn't one. */
    isFriend?: boolean
}

// Items without a handler aren't wired up yet.
export function buildUserContextMenuItems({
    onMessage,
    onProfile,
    onRemove,
    isFriend = true,
}: UserContextMenuHandlers): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
        { key: "message", label: "Send message", icon: <MessageSquare className={iconClass} />, hint: "↵", onAction: onMessage },
        { key: "call", label: "Start a call", icon: <Phone className={iconClass} /> },
        { key: "video", label: "Start a video call", icon: <Video className={iconClass} /> },
        { type: "separator", key: "sep-talk" },
        { key: "profile", label: "See profile", icon: <User className={iconClass} />, onAction: onProfile },
        { key: "verify", label: "Verify user", icon: <ShieldCheck className={iconClass} /> },
        { key: "copy", label: "Copy handle", icon: <Copy className={iconClass} />, hint: "⌘C" },
        { type: "separator", key: "sep-identity" },
        { key: "mute", label: "Mute notifications", icon: <BellOff className={iconClass} /> },
    ]
    if (isFriend) {
        items.push(
            { type: "separator", key: "sep-manage" },
            { key: "remove", label: "Remove friend", icon: <UserMinus className={iconClass} />, variant: "destructive", onAction: onRemove },
        )
    }
    return items
}
