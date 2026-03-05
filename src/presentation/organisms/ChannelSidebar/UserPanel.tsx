import { Headphones, HeadphoneOff, Mic, MicOff, Settings } from "lucide-react"
import { useState } from "react"
import { useAppStore } from "@/store/store"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { cn } from "@/presentation/_libs/utils"

export function UserPanel() {
    const user = useAppStore((s) => s.user)
    const setShowSettings = useAppStore((s) => s.setShowSettings)

    const [isMuted, setIsMuted] = useState(false)
    const [isDeafened, setIsDeafened] = useState(false)

    if (!user) return null

    const username = user.preferred_username
    const initials = username.slice(0, 2).toUpperCase()

    return (
        <div className="flex items-center gap-2 border-t border-border bg-popover p-2">
            <Avatar initials={initials} size="sm" status="online" statusBorderClass="border-popover" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{username}</p>
                <p className="truncate text-xs text-muted-foreground">Online</p>
            </div>
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
