import { Headphones, HeadphoneOff, Mic, MicOff, Settings } from "lucide-react"
import { useState } from "react"
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

export function UserPanel() {
    const user = useAppStore((s) => s.user)
    const myStatus = useAppStore((s) => s.myStatus)
    const setShowSettings = useAppStore((s) => s.setShowSettings)

    const [isMuted, setIsMuted] = useState(false)
    const [isDeafened, setIsDeafened] = useState(false)

    if (!user) return null

    const displayName = user.display_name ?? user.preferred_username
    const initials = displayName.slice(0, 2).toUpperCase()

    return (
        <div className="flex items-center gap-2 border-t border-border bg-popover p-2">
            <UserBarPopover
                trigger={
                    <Button
                        aria-label={`Open status menu for ${displayName}`}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-0.5 text-left outline-none transition-colors hover:bg-accent/40 cursor-pointer aria-expanded:bg-accent/60"
                    >
                        <Avatar
                            initials={initials}
                            imageUrl={user.avatar_url}
                            size="sm"
                            status={myStatus}
                            statusBorderClass="border-popover"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                            <p className="flex items-center gap-1 truncate font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass[myStatus])} />
                                <span className="truncate">{userStatusLabel(myStatus).toLowerCase()}</span>
                            </p>
                        </div>
                    </Button>
                }
            />
            <div className="flex items-center gap-0.5">
                <Tooltip content={isMuted ? "Unmute" : "Mute"} placement="top" delay={300}>
                    <IconButton
                        onPress={() => setIsMuted((p) => !p)}
                        aria-label={isMuted ? "Unmute" : "Mute"}
                        className={cn(
                            "p-1.5",
                            isMuted
                                ? "bg-destructive/20 text-destructive"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                    >
                        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </IconButton>
                </Tooltip>
                <Tooltip content={isDeafened ? "Undeafen" : "Deafen"} placement="top" delay={300}>
                    <IconButton
                        onPress={() => setIsDeafened((p) => !p)}
                        aria-label={isDeafened ? "Undeafen" : "Deafen"}
                        className={cn(
                            "p-1.5",
                            isDeafened
                                ? "bg-destructive/20 text-destructive"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                    >
                        {isDeafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
                    </IconButton>
                </Tooltip>
                <Tooltip content="User Settings" placement="top" delay={300}>
                    <IconButton
                        onPress={() => setShowSettings(true)}
                        aria-label="User Settings"
                        className="p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <Settings className="h-4 w-4" />
                    </IconButton>
                </Tooltip>
            </div>
        </div>
    )
}
