import { Ban, Bell, BellOff, Copy, MessageSquare, Phone, ShieldCheck, User, UserMinus, Video } from "lucide-react"
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
    /** Absent where blocking isn't offered. */
    onBlock?: () => void
    onUnblock?: () => void
    isBlocked?: boolean
}

// Items without a handler aren't wired up yet.
export function buildUserContextMenuItems({
    onMessage,
    onProfile,
    onRemove,
    onToggleMute,
    isFriend = true,
    isMuted = false,
    onBlock,
    onUnblock,
    isBlocked = false,
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
    const manage: ContextMenuItem[] = []
    if (isFriend) {
        manage.push({ key: "remove", label: "Remove friend", icon: <UserMinus className={iconClass} />, variant: "destructive", onAction: onRemove })
    }
    if (isBlocked && onUnblock) {
        manage.push({ key: "unblock", label: "Unblock", icon: <Ban className={iconClass} />, onAction: onUnblock })
    } else if (!isBlocked && onBlock) {
        manage.push({ key: "block", label: "Block", icon: <Ban className={iconClass} />, variant: "destructive", onAction: onBlock })
    }
    if (manage.length > 0) items.push({ type: "separator", key: "sep-manage" }, ...manage)
    return items
}
