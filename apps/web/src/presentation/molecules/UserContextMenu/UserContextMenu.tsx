import { ContextMenuList } from "@/presentation/molecules/ContextMenu/ContextMenuList"
import { buildUserContextMenuItems, type UserContextMenuHandlers } from "./UserContextMenu.items"

interface UserContextMenuProps extends UserContextMenuHandlers {
    /** The person's display name, used for the menu's accessible label. */
    displayName: string
    onClose?: () => void
}

export function UserContextMenu({ displayName, onClose, ...handlers }: UserContextMenuProps) {
    return (
        <ContextMenuList
            items={buildUserContextMenuItems(handlers)}
            label={`Actions for ${displayName}`}
            onClose={onClose}
        />
    )
}
