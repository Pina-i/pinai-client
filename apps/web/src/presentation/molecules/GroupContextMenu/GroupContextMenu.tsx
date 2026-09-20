import { BellOff, LogOut, MessageSquare, Phone, Video } from "lucide-react"
import { ContextMenuList, type ContextMenuItem } from "@/presentation/molecules/ContextMenu/ContextMenuList"

const iconClass = "h-4 w-4"

interface GroupContextMenuProps {
    /** The group's display name, used for the menu's accessible label. */
    displayName: string
    onClose: () => void
}

// Group variant of UserContextMenu — no identity actions (profile/verify/copy).
// Actions aren't wired up yet.
export function GroupContextMenu({ displayName, onClose }: GroupContextMenuProps) {
    const items: ContextMenuItem[] = [
        { key: "message", label: "Send message", icon: <MessageSquare className={iconClass} />, hint: "↵" },
        { key: "call", label: "Start a call", icon: <Phone className={iconClass} /> },
        { key: "video", label: "Start a video call", icon: <Video className={iconClass} /> },
        { type: "separator", key: "sep-talk" },
        { key: "mute", label: "Mute notifications", icon: <BellOff className={iconClass} /> },
        { type: "separator", key: "sep-manage" },
        { key: "quit", label: "Quit conversation", icon: <LogOut className={iconClass} />, variant: "destructive" },
    ]

    return <ContextMenuList items={items} label={`Actions for ${displayName}`} onClose={onClose} />
}
