import { BellOff, Copy, MessageSquare, Phone, ShieldCheck, User, UserMinus, Video } from "lucide-react"
import { ContextMenuList, type ContextMenuItem } from "@/presentation/molecules/ContextMenu/ContextMenuList"

const iconClass = "h-4 w-4"

interface UserContextMenuProps {
    /** The person's display name, used for the menu's accessible label. */
    displayName: string
    onClose: () => void
}

// Actions aren't wired up yet.
export function UserContextMenu({ displayName, onClose }: UserContextMenuProps) {
    const items: ContextMenuItem[] = [
        { key: "message", label: "Send message", icon: <MessageSquare className={iconClass} />, hint: "↵" },
        { key: "call", label: "Start a call", icon: <Phone className={iconClass} /> },
        { key: "video", label: "Start a video call", icon: <Video className={iconClass} /> },
        { type: "separator", key: "sep-talk" },
        { key: "profile", label: "See profile", icon: <User className={iconClass} /> },
        { key: "verify", label: "Verify user", icon: <ShieldCheck className={iconClass} /> },
        { key: "copy", label: "Copy handle", icon: <Copy className={iconClass} />, hint: "⌘C" },
        { type: "separator", key: "sep-identity" },
        { key: "mute", label: "Mute notifications", icon: <BellOff className={iconClass} /> },
        { type: "separator", key: "sep-manage" },
        { key: "remove", label: "Remove friend", icon: <UserMinus className={iconClass} />, variant: "destructive" },
    ]

    return <ContextMenuList items={items} label={`Actions for ${displayName}`} onClose={onClose} />
}
