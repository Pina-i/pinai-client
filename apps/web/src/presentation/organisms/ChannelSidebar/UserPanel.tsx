import { Headphones, HeadphoneOff, Mic, MicOff, Settings } from "lucide-react"
import { memo, useState } from "react"
import { Button } from "react-aria-components"
import { useAppStore } from "@/store/store"
import { userStatusLabel } from "@pinai/domain/models/presence"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { cn } from "@/presentation/_libs/utils"
import { UserBarPopover } from "./UserBarPopover/UserBarPopover"

const statusDotClass = {
    online: "bg-online",
    idle: "bg-idle",
    dnd: "bg-dnd",
    invisible: "bg-muted-foreground",
    offline: "bg-muted-foreground",
} as const

// Memoised: the sidebar re-renders on every conversation-list refresh; the user bar has no props.
export const UserPanel = memo(function UserPanel() {
    const user = useAppStore((s) => s.user)
    const myStatus = useAppStore((s) => s.myStatus)
    const showSettings = useAppStore((s) => s.showSettings)
    const setShowSettings = useAppStore((s) => s.setShowSettings)

    const [isMuted, setIsMuted] = useState(false)
    const [isDeafened, setIsDeafened] = useState(false)

    if (!user) return null

    const displayName = user.display_name ?? user.preferred_username
    const initials = displayName.slice(0, 2).toUpperCase()

    return (
        <div className="relative flex items-center gap-[9px] border-t border-line bg-surf2 p-[11px]">
            <UserBarPopover
                trigger={
                    <Button
                        aria-label={`Open status menu for ${displayName}`}
                        className="-m-1 flex min-w-0 flex-1 cursor-pointer items-center gap-[9px] rounded-full p-1 text-left outline-none transition-colors duration-150 hover:bg-surf3 aria-expanded:bg-surf3 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Avatar
                            initials={initials}
                            imageUrl={user.avatar_url}
                            size="sm"
                            status={myStatus}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13px] font-bold text-foreground">{displayName}</span>
                            <span className="flex items-center gap-[5px] truncate font-mono text-[10px] tracking-[0.03em] text-muted-foreground">
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass[myStatus])} />
                                <span className="truncate">{userStatusLabel(myStatus).toLowerCase()}</span>
                            </span>
                        </span>
                    </Button>
                }
            />
            <Tooltip content={isMuted ? "Unmute" : "Mute"} placement="top" delay={300}>
                <IconButton
                    variant="ghost"
                    isDanger={isMuted}
                    onPress={() => setIsMuted((p) => !p)}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </IconButton>
            </Tooltip>
            <Tooltip content={isDeafened ? "Undeafen" : "Deafen"} placement="top" delay={300}>
                <IconButton
                    variant="ghost"
                    isDanger={isDeafened}
                    onPress={() => setIsDeafened((p) => !p)}
                    aria-label={isDeafened ? "Undeafen" : "Deafen"}
                >
                    {isDeafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
                </IconButton>
            </Tooltip>
            <Tooltip content="User Settings" placement="top" delay={300}>
                <IconButton
                    variant="ghost"
                    isActive={showSettings}
                    onPress={() => setShowSettings(true)}
                    aria-label="User Settings"
                >
                    <Settings className="h-4 w-4" />
                </IconButton>
            </Tooltip>
        </div>
    )
})
