import { Bell, BellOff, ListX, LogOut, Phone, Video } from "lucide-react"
import { ContextMenuList, type ContextMenuItem } from "@/presentation/molecules/ContextMenu/ContextMenuList"

const iconClass = "h-4 w-4"

interface GroupContextMenuProps {
    /** The group's display name, used for the menu's accessible label. */
    displayName: string
    isMuted: boolean
    /** Absent while there is no conversation to mute: the item is then disabled. */
    onToggleMute?: () => void
    /** Set for a group the user was removed from: clearing it is all that is left to do. */
    onRemoveFromList?: () => void
    onClose: () => void
}

// Group variant of UserContextMenu — no identity actions (profile/verify/copy),
// and no "Send message", which is for starting a DM with a person.
// Items without a handler aren't wired up yet.
export function GroupContextMenu({
    displayName,
    isMuted,
    onToggleMute,
    onRemoveFromList,
    onClose,
}: GroupContextMenuProps) {
    const items: ContextMenuItem[] = onRemoveFromList ? [
        {
            key: "remove-from-list",
            label: "Remove from list",
            icon: <ListX className={iconClass} />,
            variant: "destructive",
            onAction: onRemoveFromList,
        },
    ] : [
        { key: "call", label: "Start a call", icon: <Phone className={iconClass} /> },
        { key: "video", label: "Start a video call", icon: <Video className={iconClass} /> },
        { type: "separator", key: "sep-talk" },
        {
            key: "mute",
            label: isMuted ? "Unmute notifications" : "Mute notifications",
            icon: isMuted ? <Bell className={iconClass} /> : <BellOff className={iconClass} />,
            isDisabled: !onToggleMute,
            onAction: onToggleMute,
        },
        { type: "separator", key: "sep-manage" },
        { key: "quit", label: "Quit conversation", icon: <LogOut className={iconClass} />, variant: "destructive" },
    ]

    return <ContextMenuList items={items} label={`Actions for ${displayName}`} onClose={onClose} />
}
