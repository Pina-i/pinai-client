import { cn } from "@/presentation/_libs/utils"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Logo } from "@/presentation/atoms/Logo/Logo"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { useAppStore } from "@/store/store"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { IncomingDmBubbles } from "./IncomingDmBubbles/IncomingDmBubbles"

export function ServerStrip() {
    const { servers, activeServer, view, switchToServer, switchToDms } = useAppStore()
    const navigate = useNavigate()

    function handleDmsPress() {
        switchToDms()
        navigate({ to: "/home" })
    }

    const dmsActive = view === "dms"

    return (
        <div className="flex w-16 shrink-0 flex-col items-center gap-2.5 border-r border-border bg-background py-3.5">
            {/* DMs / Home — circle when idle, rounded square when active. */}
            <Tooltip content="Friends" placement="right" delay={300}>
                <IconButton
                    onPress={handleDmsPress}
                    aria-label="Friends"
                    className={cn(
                        "relative flex h-10 w-10 items-center justify-center bg-card text-foreground transition-all",
                        dmsActive
                            ? "rounded-md border border-border-strong"
                            : "rounded-full hover:rounded-md",
                    )}
                >
                    <span
                        className={cn(
                            "absolute -left-3 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full bg-foreground transition-[height]",
                            dmsActive ? "h-5" : "h-0",
                        )}
                    />
                    <Logo className="h-5 w-5 text-foreground" />
                </IconButton>
            </Tooltip>

            <div className="my-1.5 h-px w-6 bg-border" />

            {/* Incoming DMs — pop in when a message arrives, click to open. */}
            <IncomingDmBubbles />

            <ScrollArea className="w-full flex-1">
                <div className="flex flex-col items-center gap-2.5">
                    {servers.map((server) => {
                        const active = view === "server" && activeServer === server.id
                        return (
                            <Tooltip key={server.id} content={server.name} placement="right" delay={300}>
                                <IconButton
                                    onPress={() => switchToServer(server.id)}
                                    aria-label={server.name}
                                    className={cn(
                                        "title relative flex h-10 w-10 items-center justify-center bg-muted text-sm font-medium text-foreground transition-all",
                                        active
                                            ? "rounded-md border border-border-strong"
                                            : "rounded-full hover:rounded-md",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "absolute -left-3 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full bg-foreground transition-[height]",
                                            active ? "h-5" : "h-0",
                                        )}
                                    />
                                    {server.initials}
                                </IconButton>
                            </Tooltip>
                        )
                    })}
                </div>
            </ScrollArea>

            <Tooltip content="Add a Server" placement="right" delay={300}>
                <IconButton
                    aria-label="Add a Server"
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border-strong bg-transparent text-muted-foreground hover:text-foreground"
                >
                    <Plus className="h-4 w-4" />
                </IconButton>
            </Tooltip>
        </div>
    )
}
