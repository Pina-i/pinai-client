import { Bell, BellOff, Copy, MessageSquare, Phone, ShieldCheck, User, UserMinus, Video } from "lucide-react"
import type { ContextMenuItem } from "@/presentation/molecules/ContextMenu/ContextMenuList"

const iconClass = "h-4 w-4"

export interface UserContextMenuHandlers {
    onMessage?: () => void
    onProfile?: () => void
    onRemove?: () => void
    /** Absent while there is no conversation with the person to mute: the item is then disabled. */
    onToggleMute?: () => void
    /** Hides "Remove friend" for someone who isn't one. */
    isFriend?: boolean
    isMuted?: boolean
}

// Items without a handler aren't wired up yet.
export function buildUserContextMenuItems({
    onMessage,
    onProfile,
    onRemove,
    onToggleMute,
    isFriend = true,
    isMuted = false,
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
        {
            key: "mute",
            label: isMuted ? "Unmute notifications" : "Mute notifications",
            icon: isMuted ? <Bell className={iconClass} /> : <BellOff className={iconClass} />,
            isDisabled: !onToggleMute,
            onAction: onToggleMute,
        },
    ]
    if (isFriend) {
        items.push(
            { type: "separator", key: "sep-manage" },
            { key: "remove", label: "Remove friend", icon: <UserMinus className={iconClass} />, variant: "destructive", onAction: onRemove },
        )
    }
    return items
}
